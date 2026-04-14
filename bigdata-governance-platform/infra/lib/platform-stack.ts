import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

interface PlatformStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  cognitoUserPoolId: string;
  cognitoClientId: string;
}

export class PlatformStack extends cdk.Stack {
  public readonly dagBucket: s3.Bucket;
  public readonly albSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, "BgpCluster", {
      vpc: props.vpc,
      clusterName: "bgp-cluster",
    });

    // S3 buckets
    const accountId = cdk.Stack.of(this).account;
    new s3.Bucket(this, "DatalakeBucket", { bucketName: `bgp-datalake-${accountId}`, removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true });
    new s3.Bucket(this, "GlueScriptsBucket", { bucketName: `bgp-glue-scripts-${accountId}`, removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true });
    this.dagBucket = new s3.Bucket(this, "MwaaDagBucket", { bucketName: `bgp-mwaa-dags-${accountId}`, removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true, versioned: true });

    // Glue Job execution role
    const glueRole = new iam.Role(this, "GlueRole", {
      roleName: "bgp-glue-role",
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
      ],
    });
    glueRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "redshift-serverless:GetCredentials",
        "redshift-data:ExecuteStatement",
        "redshift-data:DescribeStatement",
        "redshift-data:GetStatementResult",
      ],
      resources: ["*"],
    }));
    glueRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3tables:*", "lakeformation:*", "glue:*", "logs:*"],
      resources: ["*"],
    }));

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRedshiftDataFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRedshiftFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSGlueConsoleFullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2FullAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRDSReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("IAMFullAccess"),
      ],
    });
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3tables:*", "lakeformation:*", "cognito-idp:*", "airflow:*", "mwaa:*", "iam:PassRole"],
      resources: ["*"],
    }));

    // Public ALB but security group restricted to CloudFront only
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "BgpService", {
      cluster,
      serviceName: "bgp-platform",
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset("../platform"),
        containerPort: 3000,
        taskRole,
        environment: {},
      },
      publicLoadBalancer: true,
      assignPublicIp: false,
    });

    service.targetGroup.configureHealthCheck({ path: "/", healthyHttpCodes: "200-399" });

    // Export ALB DNS for DAG generator
    const albDns = service.loadBalancer.loadBalancerDnsName;
    this.albSecurityGroup = service.loadBalancer.connections.securityGroups[0];

    // Add ALB DNS to container environment (self-reference via update)
    const cfnTaskDef = service.taskDefinition.node.defaultChild as cdk.aws_ecs.CfnTaskDefinition;
    cfnTaskDef.addPropertyOverride("ContainerDefinitions.0.Environment", [
      ...Object.entries({
        AWS_REGION: cdk.Stack.of(this).region,
        AWS_ACCOUNT_ID: cdk.Stack.of(this).account,
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: props.cognitoClientId,
        COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        REDSHIFT_WORKGROUP: "bgp-workgroup",
        GLUE_SCRIPTS_BUCKET: `bgp-glue-scripts-${cdk.Stack.of(this).account}`,
        GLUE_ROLE_ARN: glueRole.roleArn,
        MWAA_DAG_BUCKET: `bgp-mwaa-dags-${cdk.Stack.of(this).account}`,
        MWAA_ENV_NAME: "bgp-mwaa",
        OPENMETADATA_URL: process.env.OPENMETADATA_URL || "",
        OPENMETADATA_PUBLIC_URL: process.env.OPENMETADATA_PUBLIC_URL || "",
        PLATFORM_ALB_DNS: albDns,
        DEFAULT_VPC_ID: props.vpc.vpcId,
        DEFAULT_SUBNET_ID: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds[0],
        DEFAULT_AZ: props.vpc.availabilityZones[0],
      }).map(([name, value]) => ({ Name: name, Value: value })),
    ]);

    // Lock down ALB SG: remove default 0.0.0.0/0, allow only CloudFront prefix list
    const albSg = service.loadBalancer.connections.securityGroups[0];
    const cfnSg = albSg.node.defaultChild as ec2.CfnSecurityGroup;

    // Remove the default wide-open ingress by clearing SecurityGroupIngress
    cfnSg.addPropertyOverride("SecurityGroupIngress", []);

    // Add CloudFront managed prefix list as ingress source
    // CloudFront managed prefix list (region-specific, looked up via CDK context or env)
    const cfPrefixListId = ec2.Peer.prefixList(
      ec2.PrefixList.fromPrefixListId(this, "CfPrefixList",
        this.node.tryGetContext("cloudfront-prefix-list") || "pl-3b927c52"
      ).prefixListId
    );
    albSg.addIngressRule(cfPrefixListId, ec2.Port.tcp(80), "Allow CloudFront only");
    albSg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(80), "Allow VPC internal");

    // CloudFront distribution → public ALB (restricted by SG)
    const distribution = new cloudfront.Distribution(this, "BgpCdn", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(service.loadBalancer.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    new cdk.CfnOutput(this, "PlatformUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
  }
}

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

interface PlatformStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  cognitoUserPoolId: string;
  cognitoClientId: string;
}

export class PlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, "BgpCluster", {
      vpc: props.vpc,
      clusterName: "bgp-cluster",
    });

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
      actions: ["s3tables:*", "lakeformation:*"],
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
        environment: {
          AWS_REGION: cdk.Stack.of(this).region,
          AWS_ACCOUNT_ID: cdk.Stack.of(this).account,
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
          NEXT_PUBLIC_COGNITO_CLIENT_ID: props.cognitoClientId,
          COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
          REDSHIFT_WORKGROUP: "bgp-workgroup",
          GLUE_SCRIPTS_BUCKET: `bgp-glue-scripts-${cdk.Stack.of(this).account}`,
          GLUE_ROLE_ARN: `arn:aws:iam::${cdk.Stack.of(this).account}:role/bgp-glue-role`,
          MWAA_DAG_BUCKET: `bgp-mwaa-dags-${cdk.Stack.of(this).account}`,
          DEFAULT_VPC_ID: props.vpc.vpcId,
          DEFAULT_SUBNET_ID: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds[0],
          DEFAULT_AZ: props.vpc.availabilityZones[0],
        },
      },
      publicLoadBalancer: true,
      assignPublicIp: false,
    });

    service.targetGroup.configureHealthCheck({ path: "/", healthyHttpCodes: "200-399" });

    // Lock down ALB SG: remove default 0.0.0.0/0, allow only CloudFront prefix list
    const albSg = service.loadBalancer.connections.securityGroups[0];
    const cfnSg = albSg.node.defaultChild as ec2.CfnSecurityGroup;

    // Remove the default wide-open ingress by clearing SecurityGroupIngress
    cfnSg.addPropertyOverride("SecurityGroupIngress", []);

    // Add CloudFront managed prefix list as ingress source
    // com.amazonaws.global.cloudfront.origin-facing prefix list ID varies by region
    const cfPrefixListId = ec2.Peer.prefixList(
      ec2.PrefixList.fromLookup(this, "CfPrefixList", {
        name: "com.amazonaws.global.cloudfront.origin-facing",
      }).prefixListId
    );
    albSg.addIngressRule(cfPrefixListId, ec2.Port.tcp(80), "Allow CloudFront only");

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

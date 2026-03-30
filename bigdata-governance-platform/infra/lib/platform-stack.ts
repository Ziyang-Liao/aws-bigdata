import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface PlatformStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
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
          AWS_REGION: "us-east-1",
          NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-1_JnGwRjVco",
          NEXT_PUBLIC_COGNITO_CLIENT_ID: "59m27ovhvfkjcsgfi8d29g0ju0",
          REDSHIFT_WORKGROUP: "bgp-workgroup",
          GLUE_SCRIPTS_BUCKET: "bgp-glue-scripts-470377450205",
          MWAA_DAG_BUCKET: "bgp-mwaa-dags-470377450205",
          DEFAULT_VPC_ID: props.vpc.vpcId,
          DEFAULT_SUBNET_ID: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds[0],
          DEFAULT_AZ: props.vpc.availabilityZones[0],
        },
      },
      publicLoadBalancer: true,
      assignPublicIp: false,
    });

    service.targetGroup.configureHealthCheck({ path: "/", healthyHttpCodes: "200-399" });

    new cdk.CfnOutput(this, "PlatformUrl", {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`,
    });
  }
}

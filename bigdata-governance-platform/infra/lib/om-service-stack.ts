import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as rds from "aws-cdk-lib/aws-rds";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface Props extends cdk.StackProps {
  vpc: ec2.Vpc;
  db: rds.DatabaseInstance;
  searchEndpoint: string;
}

export class OmServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const vpc = props.vpc;
    const omSg = new ec2.SecurityGroup(this, "OmSg", { vpc, description: "OpenMetadata Service" });
    omSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80));

    const cluster = ecs.Cluster.fromClusterAttributes(this, "Cluster", { clusterName: "bgp-cluster", vpc, securityGroups: [] });

    const taskDef = new ecs.FargateTaskDefinition(this, "OmTaskDef", { cpu: 2048, memoryLimitMiB: 4096 });
    taskDef.executionRole?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"));

    taskDef.addContainer("openmetadata", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, "OmEcr", "openmetadata-server"), "1.12.4"
      ),
      portMappings: [{ containerPort: 8585 }],
      environment: {
        OPENMETADATA_CLUSTER_NAME: "bgp-openmetadata",
        DB_DRIVER_CLASS: "com.mysql.cj.jdbc.Driver",
        DB_SCHEME: "mysql",
        DB_HOST: props.db.dbInstanceEndpointAddress,
        DB_PORT: props.db.dbInstanceEndpointPort,
        DB_USE_SSL: "false",
        OM_DATABASE: "openmetadata_db",
        SEARCH_TYPE: "opensearch",
        ELASTICSEARCH_HOST: props.searchEndpoint,
        ELASTICSEARCH_PORT: "443",
        ELASTICSEARCH_SCHEME: "https",
        SERVER_PORT: "8585",
        SERVER_ADMIN_PORT: "8586",
        AUTHENTICATION_PROVIDER: "basic",
        AUTHORIZER_PRINCIPAL_DOMAIN: "open-metadata.org",
        MIGRATION_LIMIT_PARAM: "1200",
      },
      secrets: {
        DB_USER_PASSWORD: ecs.Secret.fromSecretsManager(props.db.secret!, "password"),
        DB_USER: ecs.Secret.fromSecretsManager(props.db.secret!, "username"),
      },
      command: ["-c", "./bootstrap/openmetadata-ops.sh migrate && /openmetadata-start.sh"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "openmetadata", logRetention: logs.RetentionDays.ONE_WEEK }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8585/api/v1/system/version || exit 1"],
        interval: cdk.Duration.seconds(30), timeout: cdk.Duration.seconds(10),
        retries: 10, startPeriod: cdk.Duration.seconds(300),
      },
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, "OmAlb", { vpc, internetFacing: true, securityGroup: omSg });
    const listener = alb.addListener("OmListener", { port: 80 });

    const service = new ecs.FargateService(this, "OmService", {
      cluster, taskDefinition: taskDef, desiredCount: 1,
      assignPublicIp: false, securityGroups: [omSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      healthCheckGracePeriod: cdk.Duration.seconds(600),
    });

    listener.addTargets("OmTarget", {
      port: 8585, protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: { path: "/api/v1/system/version", interval: cdk.Duration.seconds(60), healthyThresholdCount: 2, unhealthyThresholdCount: 10 },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    new cdk.CfnOutput(this, "OpenMetadataUrl", { value: `http://${alb.loadBalancerDnsName}` });
  }
}

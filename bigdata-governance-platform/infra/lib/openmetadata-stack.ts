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

interface OpenMetadataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class OpenMetadataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OpenMetadataStackProps) {
    super(scope, id, props);

    const vpc = props.vpc;
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // Security Groups
    const omSg = new ec2.SecurityGroup(this, "OmSg", { vpc, description: "OpenMetadata Service" });
    const dbSg = new ec2.SecurityGroup(this, "OmDbSg", { vpc, description: "OpenMetadata DB" });
    dbSg.addIngressRule(omSg, ec2.Port.tcp(3306));
    omSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80), "VPC access");

    // RDS MySQL
    const db = new rds.DatabaseInstance(this, "OmDb", {
      instanceIdentifier: "bgp-openmetadata-db",
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSg],
      databaseName: "openmetadata_db",
      credentials: rds.Credentials.fromGeneratedSecret("omadmin"),
      allocatedStorage: 20, multiAz: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY, deletionProtection: false,
      parameters: { sort_buffer_size: "20971520" },
    });

    // OpenSearch
    const esSg = new ec2.SecurityGroup(this, "OmEsSg", { vpc, description: "OpenMetadata ES" });
    esSg.addIngressRule(omSg, ec2.Port.tcp(443));
    const esDomain = new opensearch.Domain(this, "OmSearch", {
      domainName: "bgp-om-search",
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc, vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, availabilityZones: [vpc.availabilityZones[0]] }],
      securityGroups: [esSg],
      capacity: { dataNodeInstanceType: "t3.small.search", dataNodes: 1 },
      ebs: { volumeSize: 20 },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessPolicies: [new iam.PolicyStatement({ actions: ["es:*"], principals: [new iam.AnyPrincipal()], resources: ["*"] })],
    });

    // ECS
    const cluster = ecs.Cluster.fromClusterAttributes(this, "Cluster", { clusterName: "bgp-cluster", vpc, securityGroups: [] });

    const taskDef = new ecs.FargateTaskDefinition(this, "OmTaskDef", { cpu: 2048, memoryLimitMiB: 4096 });
    taskDef.executionRole?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryReadOnly"));

    const omEnv: Record<string, string> = {
      OPENMETADATA_CLUSTER_NAME: "bgp-openmetadata",
      DB_DRIVER_CLASS: "com.mysql.cj.jdbc.Driver",
      DB_SCHEME: "mysql",
      DB_HOST: db.dbInstanceEndpointAddress,
      DB_PORT: db.dbInstanceEndpointPort,
      DB_USE_SSL: "false",
      OM_DATABASE: "openmetadata_db",
      SEARCH_TYPE: "opensearch",
      ELASTICSEARCH_HOST: esDomain.domainEndpoint,
      ELASTICSEARCH_PORT: "443",
      ELASTICSEARCH_SCHEME: "https",
      SERVER_PORT: "8585",
      SERVER_ADMIN_PORT: "8586",
      AUTHENTICATION_PROVIDER: "basic",
      AUTHORIZER_ADMIN_PRINCIPALS: "[admin]",
      AUTHORIZER_PRINCIPAL_DOMAIN: "open-metadata.org",
      MIGRATION_LIMIT_PARAM: "1200",
      // Auto-migrate on startup
      OPENMETADATA_MIGRATE: "true",
    };

    taskDef.addContainer("openmetadata", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, "OmEcr", "openmetadata-server"), "1.12.4"
      ),
      portMappings: [{ containerPort: 8585 }],
      environment: omEnv,
      secrets: {
        DB_USER_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, "password"),
        DB_USER: ecs.Secret.fromSecretsManager(db.secret!, "username"),
      },
      // Run migrate then start server
      command: ["sh", "-c", "./bootstrap/openmetadata-ops.sh migrate && ./bootstrap/openmetadata-ops.sh drop-create -s && /opt/openmetadata/bootstrap/openmetadata-start.sh"],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "openmetadata", logRetention: logs.RetentionDays.ONE_WEEK }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8585/api/v1/system/version || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 10,
        startPeriod: cdk.Duration.seconds(300),
      },
    });

    // Internal ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "OmAlb", { vpc, internetFacing: false, securityGroup: omSg });
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
      healthCheck: {
        path: "/api/v1/system/version",
        interval: cdk.Duration.seconds(60),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 10,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    new cdk.CfnOutput(this, "OpenMetadataUrl", { value: `http://${alb.loadBalancerDnsName}` });
  }
}

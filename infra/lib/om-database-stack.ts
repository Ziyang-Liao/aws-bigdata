import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface Props extends cdk.StackProps { vpc: ec2.Vpc; }

export class OmDatabaseStack extends cdk.Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.dbSg = new ec2.SecurityGroup(this, "OmDbSg", { vpc: props.vpc, description: "OpenMetadata DB" });
    this.dbSg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(3306));

    this.db = new rds.DatabaseInstance(this, "OmDb", {
      instanceIdentifier: "bgp-openmetadata-db",
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      vpc: props.vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [this.dbSg],
      databaseName: "openmetadata_db",
      credentials: rds.Credentials.fromGeneratedSecret("omadmin", {
        excludeCharacters: "'\"{}[]#&*?|>!%@\\",
      }),
      allocatedStorage: 20, multiAz: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY, deletionProtection: false,
      parameters: { sort_buffer_size: "20971520" },
    });

    new cdk.CfnOutput(this, "DbEndpoint", { value: this.db.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "DbPort", { value: this.db.dbInstanceEndpointPort });
  }
}

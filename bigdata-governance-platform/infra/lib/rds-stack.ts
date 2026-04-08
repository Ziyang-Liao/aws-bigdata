import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const sg = new ec2.SecurityGroup(this, "RdsSg", {
      vpc: props.vpc,
      description: "BGP Source MySQL SG",
    });
    sg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(3306));

    const instance = new rds.DatabaseInstance(this, "BgpSourceMysql", {
      instanceIdentifier: "bgp-source-mysql",
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [sg],
      databaseName: "ecommerce",
      credentials: rds.Credentials.fromPassword("admin", cdk.SecretValue.unsafePlainText("Admin123!")),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
    });

    new cdk.CfnOutput(this, "RdsEndpoint", { value: instance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "RdsPort", { value: instance.dbInstanceEndpointPort });
  }
}

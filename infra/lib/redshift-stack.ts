import * as cdk from "aws-cdk-lib";
import * as redshiftserverless from "aws-cdk-lib/aws-redshiftserverless";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface RedshiftStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RedshiftStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedshiftStackProps) {
    super(scope, id, props);

    const sg = new ec2.SecurityGroup(this, "RedshiftSg", { vpc: props.vpc, description: "Redshift Serverless SG" });
    sg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(5439));

    const namespace = new redshiftserverless.CfnNamespace(this, "BgpNamespace", {
      namespaceName: "bgp-namespace",
      dbName: "dev",
      adminUsername: "admin",
      manageAdminPassword: true,
    });

    const workgroup = new redshiftserverless.CfnWorkgroup(this, "BgpWorkgroup", {
      workgroupName: "bgp-workgroup",
      namespaceName: namespace.namespaceName,
      baseCapacity: 8,
      publiclyAccessible: false,
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
      securityGroupIds: [sg.securityGroupId],
    });
    workgroup.addDependency(namespace);

    new cdk.CfnOutput(this, "WorkgroupName", { value: workgroup.workgroupName });
  }
}

import * as cdk from "aws-cdk-lib";
import * as redshiftserverless from "aws-cdk-lib/aws-redshiftserverless";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

interface RedshiftStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RedshiftStack extends cdk.Stack {
  public readonly adminSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: RedshiftStackProps) {
    super(scope, id, props);

    const sg = new ec2.SecurityGroup(this, "RedshiftSg", { vpc: props.vpc, description: "Redshift Serverless SG" });
    sg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(5439));

    // Admin credentials in Secrets Manager
    this.adminSecret = new secretsmanager.Secret(this, "RedshiftAdminSecret", {
      secretName: "bgp/redshift/admin",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 20,
      },
    });

    const namespace = new redshiftserverless.CfnNamespace(this, "BgpNamespace", {
      namespaceName: "bgp-namespace",
      dbName: "dev",
      adminUsername: "admin",
      adminUserPassword: this.adminSecret.secretValueFromJson("password").unsafeUnwrap(),
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

    // Auto-init: create schema and grant permissions via Custom Resource
    const initSql = [
      "CREATE SCHEMA IF NOT EXISTS ecommerce",
      "GRANT ALL ON SCHEMA ecommerce TO PUBLIC",
      "GRANT CREATE ON DATABASE dev TO PUBLIC",
      "GRANT USAGE ON SCHEMA public TO PUBLIC",
      "GRANT CREATE ON SCHEMA public TO PUBLIC",
    ].join("; ");

    const initRedshift = new cr.AwsCustomResource(this, "InitRedshift", {
      onCreate: {
        service: "RedshiftData",
        action: "executeStatement",
        parameters: {
          WorkgroupName: "bgp-workgroup",
          Database: "dev",
          SecretArn: this.adminSecret.secretArn,
          Sql: initSql,
        },
        physicalResourceId: cr.PhysicalResourceId.of("init-redshift"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new cdk.aws_iam.PolicyStatement({
          actions: ["redshift-data:ExecuteStatement", "redshift-data:DescribeStatement"],
          resources: ["*"],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [this.adminSecret.secretArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ["redshift-serverless:GetCredentials"],
          resources: ["*"],
        }),
      ]),
    });
    initRedshift.node.addDependency(workgroup);

    new cdk.CfnOutput(this, "WorkgroupName", { value: workgroup.workgroupName });
    new cdk.CfnOutput(this, "AdminSecretArn", { value: this.adminSecret.secretArn });
  }
}

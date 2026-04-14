import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface Props extends cdk.StackProps { vpc: ec2.Vpc; }

export class OmSearchStack extends cdk.Stack {
  public readonly domain: opensearch.Domain;
  public readonly esSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    this.esSg = new ec2.SecurityGroup(this, "OmEsSg", { vpc: props.vpc, description: "OpenMetadata ES" });
    this.esSg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(443));

    this.domain = new opensearch.Domain(this, "OmSearch", {
      domainName: "bgp-om-search",
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, availabilityZones: [props.vpc.availabilityZones[0]] }],
      securityGroups: [this.esSg],
      capacity: { dataNodeInstanceType: "t3.small.search", dataNodes: 1 },
      ebs: { volumeSize: 20 },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessPolicies: [new iam.PolicyStatement({ actions: ["es:*"], principals: [new iam.AnyPrincipal()], resources: ["*"] })],
    });

    new cdk.CfnOutput(this, "SearchEndpoint", { value: this.domain.domainEndpoint });
  }
}

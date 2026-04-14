import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as mwaa from "aws-cdk-lib/aws-mwaa";
import { Construct } from "constructs";

interface MwaaStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dagBucketArn: string;
  albSecurityGroup: ec2.ISecurityGroup;
}

export class MwaaStack extends cdk.Stack {
  public readonly environmentName: string;

  constructor(scope: Construct, id: string, props: MwaaStackProps) {
    super(scope, id, props);

    this.environmentName = "bgp-mwaa";

    const sg = new ec2.SecurityGroup(this, "MwaaSg", {
      vpc: props.vpc,
      description: "MWAA Security Group",
    });
    sg.addIngressRule(sg, ec2.Port.allTraffic(), "MWAA self-reference");

    // Allow MWAA to access platform ALB (use Cfn to avoid cyclic dep)
    new ec2.CfnSecurityGroupIngress(this, "MwaaToAlb", {
      groupId: props.albSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 80,
      toPort: 80,
      sourceSecurityGroupId: sg.securityGroupId,
      description: "MWAA to ALB",
    });

    const role = new iam.Role(this, "MwaaRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("airflow.amazonaws.com"),
        new iam.ServicePrincipal("airflow-env.amazonaws.com"),
      ),
    });

    role.addToPolicy(new iam.PolicyStatement({
      actions: ["airflow:PublishMetrics"],
      resources: [`arn:aws:airflow:${this.region}:${this.account}:environment/${this.environmentName}`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject*", "s3:GetBucket*", "s3:List*"],
      resources: [props.dagBucketArn, `${props.dagBucketArn}/*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["logs:CreateLogStream", "logs:CreateLogGroup", "logs:PutLogEvents", "logs:GetLogEvents", "logs:GetLogRecord", "logs:GetLogGroupFields", "logs:GetQueryResults"],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:airflow-${this.environmentName}-*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["logs:DescribeLogGroups"],
      resources: ["*"],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["sqs:ChangeMessageVisibility", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "sqs:ReceiveMessage", "sqs:SendMessage"],
      resources: [`arn:aws:sqs:${this.region}:*:airflow-celery-*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey*", "kms:Encrypt"],
      resources: ["*"],
      conditions: { StringLike: { "kms:ViaService": [`sqs.${this.region}.amazonaws.com`] } },
    }));
    // DAG tasks need Glue, DynamoDB, Redshift Data API access
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["glue:StartJobRun", "glue:GetJobRun", "glue:GetJob"],
      resources: ["*"],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem"],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/bgp-*`],
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ["redshift-data:ExecuteStatement", "redshift-data:DescribeStatement", "redshift-data:GetStatementResult", "redshift-serverless:GetCredentials"],
      resources: ["*"],
    }));

    const env = new mwaa.CfnEnvironment(this, "BgpMwaa", {
      name: this.environmentName,
      airflowVersion: "2.10.3",
      environmentClass: "mw1.small",
      maxWorkers: 2,
      minWorkers: 1,
      sourceBucketArn: props.dagBucketArn,
      dagS3Path: "dags/",
      executionRoleArn: role.roleArn,
      networkConfiguration: {
        subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds.slice(0, 2),
        securityGroupIds: [sg.securityGroupId],
      },
      webserverAccessMode: "PUBLIC_ONLY",
      airflowConfigurationOptions: {
        "scheduler.dag_dir_list_interval": "30",
        "core.min_file_process_interval": "30",
        "core.dags_are_paused_at_creation": "False",
      },
      loggingConfiguration: {
        dagProcessingLogs: { enabled: true, logLevel: "INFO" },
        schedulerLogs: { enabled: true, logLevel: "INFO" },
        taskLogs: { enabled: true, logLevel: "INFO" },
        webserverLogs: { enabled: true, logLevel: "INFO" },
        workerLogs: { enabled: true, logLevel: "INFO" },
      },
    });

    new cdk.CfnOutput(this, "MwaaEnvName", { value: this.environmentName });
    new cdk.CfnOutput(this, "MwaaWebserverUrl", {
      value: cdk.Fn.getAtt(env.logicalId, "WebserverUrl").toString(),
    });
  }
}

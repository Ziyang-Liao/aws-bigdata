import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tables = [
      { name: "bgp-datasources", pk: "userId", sk: "datasourceId" },
      { name: "bgp-sync-tasks", pk: "userId", sk: "taskId" },
      { name: "bgp-workflows", pk: "userId", sk: "workflowId" },
      { name: "bgp-redshift-tasks", pk: "userId", sk: "taskId" },
      { name: "bgp-approvals", pk: "approvalId", sk: "createdAt" },
      { name: "bgp-audit-logs", pk: "userId", sk: "timestamp" },
    ];

    for (const t of tables) {
      new dynamodb.Table(this, t.name, {
        tableName: t.name,
        partitionKey: { name: t.pk, type: dynamodb.AttributeType.STRING },
        sortKey: { name: t.sk, type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }
  }
}

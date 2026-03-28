import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
export const ddb = DynamoDBDocumentClient.from(client);

export const Tables = {
  DATASOURCES: "bgp-datasources",
  SYNC_TASKS: "bgp-sync-tasks",
  WORKFLOWS: "bgp-workflows",
  REDSHIFT_TASKS: "bgp-redshift-tasks",
  APPROVALS: "bgp-approvals",
  AUDIT_LOGS: "bgp-audit-logs",
} as const;

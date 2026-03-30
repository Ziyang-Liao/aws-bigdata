import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
export const docClient = DynamoDBDocumentClient.from(client);

export const TABLES = {
  DATASOURCES: "bgp-datasources",
  SYNC_TASKS: "bgp-sync-tasks",
  WORKFLOWS: "bgp-workflows",
  REDSHIFT_TASKS: "bgp-redshift-tasks",
  TASK_RUNS: "bgp-task-runs",
} as const;

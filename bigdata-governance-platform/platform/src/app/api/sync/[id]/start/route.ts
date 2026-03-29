import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, CreateJobCommand, StartJobRunCommand } from "@aws-sdk/client-glue";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { generateGlueScript } from "@/lib/sync/glue-script-generator";
import type { DataSource } from "@/types/datasource";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  // Get task
  const { Item: task } = await docClient.send(
    new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } })
  );
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Get datasource
  const { Item: ds } = await docClient.send(
    new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: task.datasourceId } })
  );
  if (!ds) return NextResponse.json({ error: "DataSource not found" }, { status: 404 });

  try {
    if (task.channel === "glue") {
      // Generate and upload Glue script
      const script = generateGlueScript(task as any, ds as DataSource);
      const scriptKey = `glue-scripts/${task.taskId}.py`;
      const bucket = process.env.GLUE_SCRIPTS_BUCKET || "bgp-glue-scripts";

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: scriptKey, Body: script }));

      const jobName = `bgp-sync-${task.taskId}`;
      try {
        await glue.send(new CreateJobCommand({
          Name: jobName,
          Role: process.env.GLUE_ROLE_ARN || "",
          Command: { Name: "glueetl", ScriptLocation: `s3://${bucket}/${scriptKey}`, PythonVersion: "3" },
          GlueVersion: "4.0",
          NumberOfWorkers: 2,
          WorkerType: "G.1X",
        }));
      } catch (e: any) {
        if (!e.message?.includes("already exists")) throw e;
      }

      const { JobRunId } = await glue.send(new StartJobRunCommand({ JobName: jobName }));

      await docClient.send(new UpdateCommand({
        TableName: TABLES.SYNC_TASKS,
        Key: { userId: USER_ID, taskId: params.id },
        UpdateExpression: "SET #s = :s, glueJobName = :j, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "running", ":j": jobName, ":now": new Date().toISOString() },
      }));

      return NextResponse.json({ success: true, channel: "glue", jobName, jobRunId: JobRunId });
    }

    if (task.channel === "zero-etl") {
      // Zero-ETL: create Glue integration
      const { CreateIntegrationCommand } = await import("@aws-sdk/client-glue");
      const result: any = await glue.send(new (CreateIntegrationCommand as any)({
        IntegrationName: `bgp-zetl-${task.taskId}`,
        SourceArn: ds.glueConnectionName || "",
        TargetArn: process.env.REDSHIFT_NAMESPACE_ARN || "",
      }));
      const IntegrationArn = result.IntegrationArn;

      await docClient.send(new UpdateCommand({
        TableName: TABLES.SYNC_TASKS,
        Key: { userId: USER_ID, taskId: params.id },
        UpdateExpression: "SET #s = :s, integrationArn = :a, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "running", ":a": IntegrationArn, ":now": new Date().toISOString() },
      }));

      return NextResponse.json({ success: true, channel: "zero-etl", integrationArn: IntegrationArn });
    }

    if (task.channel === "dms") {
      const { DatabaseMigrationServiceClient, CreateReplicationTaskCommand, StartReplicationTaskCommand } = await import("@aws-sdk/client-database-migration-service");
      const dms = new DatabaseMigrationServiceClient({ region: process.env.AWS_REGION || "us-east-1" });

      const taskId = `bgp-dms-${task.taskId}`;
      const tableMappings = JSON.stringify({
        rules: [{ "rule-type": "selection", "rule-id": "1", "rule-name": "include-tables", "object-locator": { "schema-name": task.sourceDatabase || "%", "table-name": "%" }, "rule-action": "include" }],
      });

      await dms.send(new CreateReplicationTaskCommand({
        ReplicationTaskIdentifier: taskId,
        SourceEndpointArn: process.env.DMS_SOURCE_ENDPOINT_ARN || "",
        TargetEndpointArn: process.env.DMS_TARGET_ENDPOINT_ARN || "",
        ReplicationInstanceArn: process.env.DMS_REPLICATION_INSTANCE_ARN || "",
        MigrationType: task.syncMode === "incremental" ? "cdc" : "full-load",
        TableMappings: tableMappings,
      }));

      await dms.send(new StartReplicationTaskCommand({
        ReplicationTaskArn: taskId,
        StartReplicationTaskType: "start-replication",
      }));

      await docClient.send(new UpdateCommand({
        TableName: TABLES.SYNC_TASKS,
        Key: { userId: USER_ID, taskId: params.id },
        UpdateExpression: "SET #s = :s, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": "running", ":now": new Date().toISOString() },
      }));

      return NextResponse.json({ success: true, channel: "dms", taskId });
    }

    return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

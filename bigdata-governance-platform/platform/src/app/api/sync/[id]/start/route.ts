export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, CreateJobCommand, StartJobRunCommand, GetCatalogCommand, CreateCatalogCommand } from "@aws-sdk/client-glue";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3TablesClient, CreateTableBucketCommand, CreateNamespaceCommand, ListTableBucketsCommand, ListNamespacesCommand } from "@aws-sdk/client-s3tables";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { generateGlueScript } from "@/lib/sync/glue-script-generator";
import { apiOk, apiError } from "@/lib/api-response";
import { ulid } from "ulid";
import type { DataSource } from "@/types/datasource";

const USER_ID = "default-user";
const region = process.env.AWS_REGION || "us-east-1";
const glue = new GlueClient({ region });
const s3 = new S3Client({ region });
const s3tables = new S3TablesClient({ region });

async function ensureS3TableBucketAndNamespace(bucketName: string, namespace: string): Promise<string> {
  // Find or create table bucket
  let bucketArn = "";
  const { tableBuckets = [] } = await s3tables.send(new ListTableBucketsCommand({}));
  const existing = tableBuckets.find((b) => b.name === bucketName);
  if (existing) {
    bucketArn = existing.arn!;
  } else {
    const res = await s3tables.send(new CreateTableBucketCommand({ name: bucketName }));
    bucketArn = res.arn!;
  }

  // Ensure s3tablescatalog federated catalog exists in Glue Data Catalog
  const accountId = bucketArn.split(":")[4];
  try {
    await glue.send(new GetCatalogCommand({ CatalogId: "s3tablescatalog" }));
  } catch {
    await glue.send(new CreateCatalogCommand({
      Name: "s3tablescatalog",
      CatalogInput: {
        Description: "Federated catalog for S3 Tables",
        FederatedCatalog: {
          Identifier: `arn:aws:s3tables:${region}:${accountId}:bucket/*`,
          ConnectionName: "aws:s3tables",
        },
        CreateDatabaseDefaultPermissions: [{ Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] }],
        CreateTableDefaultPermissions: [{ Principal: { DataLakePrincipalIdentifier: "IAM_ALLOWED_PRINCIPALS" }, Permissions: ["ALL"] }],
      },
    })).catch(() => {});
  }

  // Ensure namespace exists
  try {
    const { namespaces = [] } = await s3tables.send(new ListNamespacesCommand({ tableBucketARN: bucketArn }));
    if (!namespaces.some((n) => n.namespace?.includes(namespace))) {
      await s3tables.send(new CreateNamespaceCommand({ tableBucketARN: bucketArn, namespace: [namespace] }));
    }
  } catch (e: any) {
    if (!e.message?.includes("already exists")) throw e;
  }

  return bucketArn;
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(
      new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } })
    );
    if (!task) return apiError("任务不存在", 404);

    const { Item: ds } = await docClient.send(
      new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: task.datasourceId } })
    );
    if (!ds) return apiError("数据源不存在", 404);

    const roleArn = process.env.GLUE_ROLE_ARN;
    if (!roleArn) return apiError("GLUE_ROLE_ARN 未配置");

    const channel = task.channel || "glue";
    if (channel !== "glue") return apiError(`通道 ${channel} 暂未实现`);

    // Auto-create S3 Table Bucket & Namespace if target is S3 Tables
    const writeS3 = task.targetType === "s3-tables" || task.targetType === "both";
    const tableBucketName = task.s3Config?.tableBucket || "bgp-table-bucket";
    const namespace = task.s3Config?.namespace || ds.database || "default";
    if (writeS3) {
      await ensureS3TableBucketAndNamespace(tableBucketName, namespace);
      // Patch task config so glue script uses correct namespace
      task.s3Config = { ...task.s3Config, tableBucket: tableBucketName, namespace };
    }

    // Generate script
    const script = generateGlueScript(task, ds as DataSource);
    const bucket = process.env.GLUE_SCRIPTS_BUCKET || `bgp-glue-scripts-${process.env.AWS_ACCOUNT_ID}`;
    const scriptKey = `glue-scripts/${task.taskId}.py`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: scriptKey, Body: script }));

    // Create or reuse Glue Job
    const jobName = `bgp-sync-${task.taskId.slice(-12)}`;
    const connName = ds.glueConnectionName;
    try {
      await glue.send(new CreateJobCommand({
        Name: jobName, Role: roleArn,
        Command: { Name: "glueetl", ScriptLocation: `s3://${bucket}/${scriptKey}`, PythonVersion: "3" },
        GlueVersion: "5.1", NumberOfWorkers: 2, WorkerType: "G.1X",
        DefaultArguments: {
          "--datalake-formats": "iceberg",
          "--TempDir": `s3://${bucket}/temp/`,
          "--conf": [
            "spark.sql.catalog.s3tablescatalog=org.apache.iceberg.spark.SparkCatalog",
            "spark.sql.catalog.s3tablescatalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog",
            `spark.sql.catalog.s3tablescatalog.glue.id=${process.env.AWS_ACCOUNT_ID}:s3tablescatalog/bgp-table-bucket`,
            "spark.sql.catalog.s3tablescatalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO",
            `spark.sql.catalog.s3tablescatalog.warehouse=arn:aws:s3tables:us-east-1:${process.env.AWS_ACCOUNT_ID}:bucket/bgp-table-bucket`,
          ].join(" --conf "),
        },
        Connections: connName ? { Connections: [connName] } : undefined,
      }));
    } catch (e: any) {
      if (!e.message?.includes("already exists")) {
        // Retry with Glue 4.0 if 5.0 not available
        try {
          await glue.send(new CreateJobCommand({
            Name: jobName, Role: roleArn,
            Command: { Name: "glueetl", ScriptLocation: `s3://${bucket}/${scriptKey}`, PythonVersion: "3" },
            GlueVersion: "5.1", NumberOfWorkers: 2, WorkerType: "G.1X",
            DefaultArguments: { "--datalake-formats": "iceberg" },
            Connections: connName ? { Connections: [connName] } : undefined,
          }));
        } catch (e2: any) {
          if (!e2.message?.includes("already exists")) throw e2;
        }
      }
    }

    // Start job run
    const { JobRunId } = await glue.send(new StartJobRunCommand({ JobName: jobName }));

    // Create run record in bgp-task-runs
    const runId = ulid();
    const now = new Date().toISOString();
    await docClient.send(new PutCommand({
      TableName: TABLES.TASK_RUNS,
      Item: {
        taskId: params.id,
        runId,
        taskType: "sync",
        status: "running",
        startedAt: now,
        triggeredBy: "manual",
        glueJobName: jobName,
        glueJobRunId: JobRunId,
        metrics: { rowsRead: 0, rowsWritten: 0 },
      },
    }));

    // Update task status
    await docClient.send(new UpdateCommand({
      TableName: TABLES.SYNC_TASKS,
      Key: { userId: USER_ID, taskId: params.id },
      UpdateExpression: "SET #s = :s, glueJobName = :j, lastRunId = :r, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "running", ":j": jobName, ":r": runId, ":now": now },
    }));

    // Poll for completion in background (update run record when done)
    pollGlueJob(params.id, runId, jobName, JobRunId!).catch(() => {});

    return apiOk({ channel: "glue", jobName, jobRunId: JobRunId, runId });
  } catch (err: any) {
    return apiError(`启动失败: ${err.message}`, 500);
  }
}

async function pollGlueJob(taskId: string, runId: string, jobName: string, jobRunId: string) {
  const { GetJobRunCommand } = await import("@aws-sdk/client-glue");

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 15000));

    try {
      const { JobRun } = await glue.send(new GetJobRunCommand({ JobName: jobName, RunId: jobRunId }));
      if (!JobRun) continue;

      const state = JobRun.JobRunState;
      if (state === "SUCCEEDED" || state === "FAILED" || state === "STOPPED" || state === "ERROR") {
        const now = new Date().toISOString();
        const status = state === "SUCCEEDED" ? "succeeded" : "failed";

        // Collect full logs and save to S3
        let logS3Key = "";
        try {
          const { CloudWatchLogsClient, GetLogEventsCommand, DescribeLogStreamsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
          const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });
          const allLogs: string[] = [];

          for (const logGroup of ["/aws-glue/jobs/output", "/aws-glue/jobs/logs-v2"]) {
            try {
              const { logStreams = [] } = await cwl.send(new DescribeLogStreamsCommand({
                logGroupName: logGroup, orderBy: "LastEventTime", descending: true, limit: 20,
              }));
              const streams = logStreams.filter((s) => s.logStreamName?.includes(jobRunId.slice(0, 20)));
              for (const stream of (streams.length > 0 ? streams : logStreams).slice(0, 3)) {
                let nextToken: string | undefined;
                do {
                  const { events = [], nextForwardToken } = await cwl.send(new GetLogEventsCommand({
                    logGroupName: logGroup, logStreamName: stream.logStreamName!, startFromHead: true, limit: 1000, nextToken,
                  }));
                  for (const e of events) { if (e.message) allLogs.push(`[${new Date(e.timestamp || 0).toISOString()}] ${e.message.trim()}`); }
                  if (nextForwardToken === nextToken) break;
                  nextToken = nextForwardToken;
                } while (nextToken);
              }
              if (allLogs.length > 0) break;
            } catch {}
          }

          if (allLogs.length > 0) {
            const { PutObjectCommand } = await import("@aws-sdk/client-s3");
            const bucket = process.env.GLUE_SCRIPTS_BUCKET || `bgp-glue-scripts-${process.env.AWS_ACCOUNT_ID}`;
            logS3Key = `logs/${taskId}/${runId}.log`;
            await s3.send(new PutObjectCommand({
              Bucket: bucket, Key: logS3Key,
              Body: allLogs.join("\n"),
              ContentType: "text/plain",
            }));
          }
        } catch {}

        // Update run record
        await docClient.send(new UpdateCommand({
          TableName: TABLES.TASK_RUNS,
          Key: { taskId, runId },
          UpdateExpression: "SET #s = :s, finishedAt = :f, #d = :d, #e = :e, logS3Key = :l",
          ExpressionAttributeNames: { "#s": "status", "#d": "duration", "#e": "error" },
          ExpressionAttributeValues: {
            ":s": status, ":f": now, ":d": JobRun.ExecutionTime || 0,
            ":e": JobRun.ErrorMessage || null, ":l": logS3Key || null,
          },
        }));

        // Update task status
        await docClient.send(new UpdateCommand({
          TableName: TABLES.SYNC_TASKS,
          Key: { userId: USER_ID, taskId },
          UpdateExpression: "SET #s = :s, updatedAt = :now",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":s": status === "succeeded" ? "stopped" : "error", ":now": now },
        }));

        return;
      }
    } catch {}
  }
}

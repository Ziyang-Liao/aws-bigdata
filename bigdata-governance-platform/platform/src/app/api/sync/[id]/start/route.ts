import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, CreateJobCommand, StartJobRunCommand } from "@aws-sdk/client-glue";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { generateGlueScript } from "@/lib/sync/glue-script-generator";
import { apiOk, apiError } from "@/lib/api-response";
import type { DataSource } from "@/types/datasource";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(
      new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } })
    );
    if (!task) return apiError("任务不存在", 404);

    const { Item: ds } = await docClient.send(
      new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: task.datasourceId } })
    );
    if (!ds) return apiError("数据源不存在，请先配置数据源", 404);

    const roleArn = process.env.GLUE_ROLE_ARN;
    if (!roleArn) return apiError("Glue IAM Role 未配置，请在系统设置中配置 GLUE_ROLE_ARN");

    const channel = task.channel || "glue";

    if (channel === "glue") {
      const script = generateGlueScript(task as any, ds as DataSource);
      const bucket = process.env.GLUE_SCRIPTS_BUCKET || "bgp-glue-scripts-470377450205";
      const scriptKey = `glue-scripts/${task.taskId}.py`;

      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: scriptKey, Body: script }));

      const jobName = `bgp-sync-${task.taskId.slice(-12)}`;
      const connName = ds.glueConnectionName;

      try {
        await glue.send(new CreateJobCommand({
          Name: jobName,
          Role: roleArn,
          Command: { Name: "glueetl", ScriptLocation: `s3://${bucket}/${scriptKey}`, PythonVersion: "3" },
          GlueVersion: "4.0",
          NumberOfWorkers: 2,
          WorkerType: "G.1X",
          Connections: connName ? { Connections: [connName] } : undefined,
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

      return apiOk({ channel: "glue", jobName, jobRunId: JobRunId });
    }

    // Zero-ETL / DMS channels
    return apiError(`通道 ${channel} 暂未实现，请使用 Glue ETL`);
  } catch (err: any) {
    return apiError(`启动失败: ${err.message}`, 500);
  }
}

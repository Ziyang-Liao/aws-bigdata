export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { MWAAClient, CreateCliTokenCommand } from "@aws-sdk/client-mwaa";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { generateAirflowDag } from "@/lib/workflow/dag-generator";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const mwaa = new MWAAClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { taskId, taskType, cronExpression, enabled } = await req.json();
  if (!taskId) return apiError("缺少 taskId");

  try {
    if (taskType === "workflow") {
      // Update workflow cron and regenerate DAG with schedule_interval
      const { Item: wf } = await docClient.send(new GetCommand({
        TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: taskId },
      }));
      if (!wf) return apiError("工作流不存在", 404);

      const cron = enabled ? cronExpression : undefined;
      const dagId = wf.airflowDagId || `bgp_${taskId}`;

      // Update DynamoDB
      await docClient.send(new UpdateCommand({
        TableName: TABLES.WORKFLOWS,
        Key: { userId: USER_ID, workflowId: taskId },
        UpdateExpression: "SET scheduleEnabled = :e, cronExpression = :c, updatedAt = :now",
        ExpressionAttributeValues: { ":e": !!enabled, ":c": cron || null, ":now": new Date().toISOString() },
      }));

      // Regenerate DAG with updated cron
      const updatedWf = { ...wf, cronExpression: cron, airflowDagId: dagId };
      const dagContent = generateAirflowDag(updatedWf as any);
      const bucket = process.env.MWAA_DAG_BUCKET || "bgp-mwaa-dags";
      await s3.send(new PutObjectCommand({
        Bucket: bucket, Key: `dags/${dagId}.py`, Body: dagContent, ContentType: "text/x-python",
      }));

      // Unpause DAG if enabling
      if (enabled) {
        try {
          const envName = process.env.MWAA_ENV_NAME || "bgp-mwaa";
          const { CliToken, WebServerHostname } = await mwaa.send(new CreateCliTokenCommand({ Name: envName }));
          await fetch(`https://${WebServerHostname}/aws_mwaa/cli`, {
            method: "POST", headers: { Authorization: `Bearer ${CliToken}`, "Content-Type": "text/plain" },
            body: `dags unpause ${dagId}`,
          });
        } catch {}
      }

      return apiOk({ dagId, enabled: !!enabled, cronExpression: cron, engine: "MWAA" });
    }

    // For sync tasks: update cron in DynamoDB (sync tasks don't have DAGs by default)
    await docClient.send(new UpdateCommand({
      TableName: TABLES.SYNC_TASKS,
      Key: { userId: USER_ID, taskId },
      UpdateExpression: "SET scheduleEnabled = :e, cronExpression = :c, updatedAt = :now",
      ExpressionAttributeValues: { ":e": !!enabled, ":c": enabled ? cronExpression : null, ":now": new Date().toISOString() },
    }));

    return apiOk({ enabled: !!enabled, cronExpression });
  } catch (e: any) {
    return apiError(`调度配置失败: ${e.message}`, 500);
  }
}

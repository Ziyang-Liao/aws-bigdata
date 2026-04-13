export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, BatchStopJobRunCommand } from "@aws-sdk/client-glue";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(
      new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } })
    );
    if (!task) return apiError("任务不存在", 404);

    if (task.glueJobName) {
      try {
        await glue.send(new BatchStopJobRunCommand({ JobName: task.glueJobName, JobRunIds: [] }));
      } catch {}
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLES.SYNC_TASKS,
      Key: { userId: USER_ID, taskId: params.id },
      UpdateExpression: "SET #s = :s, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "stopped", ":now": new Date().toISOString() },
    }));

    return apiOk({ stopped: true });
  } catch (err: any) {
    return apiError(err.message, 500);
  }
}

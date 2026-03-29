import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, BatchStopJobRunCommand } from "@aws-sdk/client-glue";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item: task } = await docClient.send(
    new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } })
  );
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (task.channel === "glue" && task.glueJobName) {
      await glue.send(new BatchStopJobRunCommand({ JobName: task.glueJobName, JobRunIds: [] }));
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLES.SYNC_TASKS,
      Key: { userId: USER_ID, taskId: params.id },
      UpdateExpression: "SET #s = :s, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "stopped", ":now": new Date().toISOString() },
    }));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

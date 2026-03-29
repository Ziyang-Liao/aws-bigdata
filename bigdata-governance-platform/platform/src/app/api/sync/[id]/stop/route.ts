import { ddb, Tables } from "@/lib/aws/dynamodb";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { glue } from "@/lib/aws/glue";
import { BatchStopJobRunCommand, GetJobRunsCommand } from "@aws-sdk/client-glue";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/sync/:id/stop
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { Item: task } = await ddb.send(
    new GetCommand({ TableName: Tables.SYNC_TASKS, Key: { userId: "default", taskId: id } })
  );
  if (!task?.glueJobName) return NextResponse.json({ error: "No running job" }, { status: 400 });

  // 获取运行中的 Job Runs
  const { JobRuns = [] } = await glue.send(
    new GetJobRunsCommand({ JobName: task.glueJobName })
  );
  const runningIds = JobRuns.filter(r => r.JobRunState === "RUNNING").map(r => r.Id!);

  if (runningIds.length > 0) {
    await glue.send(new BatchStopJobRunCommand({ JobName: task.glueJobName, JobRunIds: runningIds }));
  }

  await ddb.send(new UpdateCommand({
    TableName: Tables.SYNC_TASKS,
    Key: { userId: "default", taskId: id },
    UpdateExpression: "SET #s = :s, updatedAt = :ua",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": "stopped", ":ua": new Date().toISOString() },
  }));

  return NextResponse.json({ success: true });
}

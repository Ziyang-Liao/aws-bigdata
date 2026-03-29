import { ddb, Tables } from "@/lib/aws/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { glue } from "@/lib/aws/glue";
import { GetJobRunsCommand } from "@aws-sdk/client-glue";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/sync/:id/runs
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { Item: task } = await ddb.send(
    new GetCommand({ TableName: Tables.SYNC_TASKS, Key: { userId: "default", taskId: id } })
  );
  if (!task?.glueJobName) return NextResponse.json([]);

  const { JobRuns = [] } = await glue.send(
    new GetJobRunsCommand({ JobName: task.glueJobName, MaxResults: 20 })
  );

  const runs = JobRuns.map(r => ({
    id: r.Id,
    status: r.JobRunState,
    startedOn: r.StartedOn?.toISOString(),
    completedOn: r.CompletedOn?.toISOString(),
    executionTime: r.ExecutionTime,
    errorMessage: r.ErrorMessage,
  }));

  return NextResponse.json(runs);
}

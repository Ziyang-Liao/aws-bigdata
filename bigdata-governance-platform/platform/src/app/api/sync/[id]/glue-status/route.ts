import { NextRequest } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, GetJobRunsCommand } from "@aws-sdk/client-glue";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }));
    if (!task?.glueJobName) return apiOk(null);

    const { JobRuns = [] } = await glue.send(new GetJobRunsCommand({ JobName: task.glueJobName, MaxResults: 1 }));
    if (JobRuns.length === 0) return apiOk(null);

    const run = JobRuns[0];
    return apiOk({
      state: run.JobRunState,
      startedOn: run.StartedOn?.toISOString(),
      completedOn: run.CompletedOn?.toISOString(),
      executionTime: run.ExecutionTime,
      dpuSeconds: run.DPUSeconds,
      errorMessage: run.ErrorMessage,
      jobRunId: run.Id,
    });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

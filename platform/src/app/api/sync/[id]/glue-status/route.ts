export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
    const state = run.JobRunState;

    // Auto-update task and run status if Glue finished but DynamoDB not updated yet
    if ((state === "SUCCEEDED" || state === "FAILED" || state === "STOPPED") && task.status === "running") {
      const now = new Date().toISOString();
      const newStatus = state === "SUCCEEDED" ? "stopped" : "error";

      // Update task status
      await docClient.send(new UpdateCommand({
        TableName: TABLES.SYNC_TASKS,
        Key: { userId: USER_ID, taskId: params.id },
        UpdateExpression: "SET #s = :s, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": newStatus, ":now": now },
      }));

      // Update latest run record
      try {
        const { Items = [] } = await docClient.send(new QueryCommand({
          TableName: TABLES.TASK_RUNS, KeyConditionExpression: "taskId = :t",
          ExpressionAttributeValues: { ":t": params.id }, ScanIndexForward: false, Limit: 1,
        }));
        if (Items[0] && Items[0].status === "running") {
          await docClient.send(new UpdateCommand({
            TableName: TABLES.TASK_RUNS,
            Key: { taskId: params.id, runId: Items[0].runId },
            UpdateExpression: "SET #s = :s, finishedAt = :f, #d = :d, #e = :e",
            ExpressionAttributeNames: { "#s": "status", "#d": "duration", "#e": "error" },
            ExpressionAttributeValues: {
              ":s": state === "SUCCEEDED" ? "succeeded" : "failed",
              ":f": now, ":d": run.ExecutionTime || 0,
              ":e": run.ErrorMessage || null,
            },
          }));
        }
      } catch {}
    }

    return apiOk({
      state, startedOn: run.StartedOn?.toISOString(), completedOn: run.CompletedOn?.toISOString(),
      executionTime: run.ExecutionTime, dpuSeconds: run.DPUSeconds,
      errorMessage: run.ErrorMessage, jobRunId: run.Id,
    });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

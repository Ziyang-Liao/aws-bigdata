export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand, GetScheduleCommand } from "@aws-sdk/client-scheduler";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const scheduler = new SchedulerClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { taskId, taskType, cronExpression, enabled } = await req.json();
  if (!taskId || !cronExpression) return apiError("缺少 taskId 或 cronExpression");

  const table = taskType === "workflow" ? TABLES.WORKFLOWS : TABLES.SYNC_TASKS;
  const keyField = taskType === "workflow" ? "workflowId" : "taskId";
  const scheduleName = `bgp-${taskType || "sync"}-${taskId.slice(-12)}`;

  try {
    if (enabled) {
      // Create or update EventBridge Schedule
      const platformUrl = process.env.PLATFORM_URL || "http://localhost:3000";
      const roleArn = process.env.SCHEDULER_ROLE_ARN || process.env.GLUE_ROLE_ARN || "";

      // Convert cron: "0 2 * * *" → "cron(0 2 * * ? *)" (EventBridge format)
      const parts = cronExpression.trim().split(/\s+/);
      let ebCron = cronExpression;
      if (parts.length === 5) {
        // Standard cron → EventBridge cron (add ? for day-of-week or day-of-month)
        const [min, hour, dom, mon, dow] = parts;
        ebCron = `cron(${min} ${hour} ${dom === "*" ? "*" : dom} ${mon} ${dow === "*" ? "?" : dow} *)`;
      }

      try {
        await scheduler.send(new CreateScheduleCommand({
          Name: scheduleName,
          ScheduleExpression: ebCron,
          ScheduleExpressionTimezone: "UTC",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: `arn:aws:lambda:${process.env.AWS_REGION || "us-east-1"}:${process.env.AWS_ACCOUNT_ID || "470377450205"}:function:bgp-scheduler-trigger`,
            RoleArn: roleArn,
            Input: JSON.stringify({ taskId, taskType: taskType || "sync", action: "start" }),
          },
          State: "ENABLED",
          ActionAfterCompletion: "NONE",
        }));
      } catch (e: any) {
        if (e.name === "ConflictException") {
          // Schedule exists, delete and recreate
          await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName }));
          await scheduler.send(new CreateScheduleCommand({
            Name: scheduleName,
            ScheduleExpression: ebCron,
            ScheduleExpressionTimezone: "UTC",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: `arn:aws:lambda:${process.env.AWS_REGION || "us-east-1"}:${process.env.AWS_ACCOUNT_ID || "470377450205"}:function:bgp-scheduler-trigger`,
              RoleArn: roleArn,
              Input: JSON.stringify({ taskId, taskType: taskType || "sync", action: "start" }),
            },
            State: "ENABLED",
          }));
        } else {
          throw e;
        }
      }
    } else {
      // Delete schedule
      try {
        await scheduler.send(new DeleteScheduleCommand({ Name: scheduleName }));
      } catch {}
    }

    // Update DynamoDB
    await docClient.send(new UpdateCommand({
      TableName: table,
      Key: { userId: USER_ID, [keyField]: taskId },
      UpdateExpression: "SET scheduleEnabled = :e, cronExpression = :c, scheduleName = :s, updatedAt = :now",
      ExpressionAttributeValues: {
        ":e": !!enabled, ":c": cronExpression,
        ":s": enabled ? scheduleName : null,
        ":now": new Date().toISOString(),
      },
    }));

    return apiOk({ scheduleName, enabled: !!enabled, cronExpression });
  } catch (e: any) {
    return apiError(`调度配置失败: ${e.message}`, 500);
  }
}

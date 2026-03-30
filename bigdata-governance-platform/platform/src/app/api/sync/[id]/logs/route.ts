export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchLogsClient, GetLogEventsCommand, DescribeLogStreamsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }));
    if (!task?.glueJobName) return apiOk([]);

    const logGroups = ["/aws-glue/jobs/logs-v2", "/aws-glue/jobs/output"];
    const allLogs: string[] = [];

    for (const logGroup of logGroups) {
      try {
        // Find log streams - Glue uses job run ID as stream name
        const { logStreams = [] } = await cwl.send(new DescribeLogStreamsCommand({
          logGroupName: logGroup,
          orderBy: "LastEventTime",
          descending: true,
          limit: 10,
        }));

        // Filter streams related to this job
        const jobStreams = logStreams.filter((s) => {
          const name = s.logStreamName || "";
          return name.includes(task.glueJobName) || task.glueJobName?.includes(name.split("-")[0]);
        });

        // If no match by job name, take the most recent streams
        const streamsToRead = jobStreams.length > 0 ? jobStreams.slice(0, 3) : logStreams.slice(0, 3);

        for (const stream of streamsToRead) {
          try {
            const { events = [] } = await cwl.send(new GetLogEventsCommand({
              logGroupName: logGroup,
              logStreamName: stream.logStreamName!,
              startFromHead: false,
              limit: 100,
            }));
            for (const e of events) {
              if (e.message) allLogs.push(e.message.trim());
            }
          } catch {}
        }
        if (allLogs.length > 0) break; // Found logs, stop searching
      } catch {}
    }

    return apiOk(allLogs.length > 0 ? allLogs : ["日志暂未生成，Glue Job 启动后约 30-60 秒开始输出日志"]);
  } catch (e: any) {
    // Log group might not exist yet
    return apiOk(["日志组不存在，任务首次运行后将自动创建"]);
  }
}

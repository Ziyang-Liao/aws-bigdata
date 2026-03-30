export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { CloudWatchLogsClient, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  // Try sync task first, then workflow
  let task = (await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }))).Item;
  let logGroup = "";

  if (task?.glueJobName) {
    logGroup = `/aws-glue/jobs/output`;
  } else {
    task = (await docClient.send(new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } }))).Item;
    if (task?.airflowDagId) {
      logGroup = `/aws/mwaa/${process.env.MWAA_ENV_NAME || "bgp-mwaa"}`;
    }
  }

  if (!logGroup) {
    return NextResponse.json({ logs: [], message: "无可用日志" });
  }

  try {
    const { events = [] } = await cwl.send(new GetLogEventsCommand({
      logGroupName: logGroup,
      logStreamName: params.id,
      limit: 100,
      startFromHead: false,
    }));

    return NextResponse.json({
      logs: events.map((e) => ({ timestamp: e.timestamp, message: e.message })),
    });
  } catch (err: any) {
    return NextResponse.json({ logs: [], message: err.message });
  }
}

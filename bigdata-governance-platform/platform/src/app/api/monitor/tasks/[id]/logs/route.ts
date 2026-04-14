export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const runId = req.nextUrl.searchParams.get("runId");

  // Try sync task first
  const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }));

  if (task) {
    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.TASK_RUNS, KeyConditionExpression: "taskId = :t",
      ExpressionAttributeValues: { ":t": params.id }, ScanIndexForward: false, Limit: 1,
    }));
    const run = Items[0];
    if (run?.logS3Key) {
      try {
        const bucket = process.env.GLUE_SCRIPTS_BUCKET || `bgp-glue-scripts-${process.env.AWS_ACCOUNT_ID}`;
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: run.logS3Key }));
        const text = await Body!.transformToString();
        return NextResponse.json({ logs: text.split("\n").map((line: string) => ({ message: line })) });
      } catch {}
    }
    return NextResponse.json({ logs: [{ message: "暂无日志" }] });
  }

  // Try workflow
  const { Item: wf } = await docClient.send(new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } }));
  if (wf) {
    const dagId = wf.airflowDagId;
    if (!dagId) return NextResponse.json({ logs: [{ message: "工作流尚未发布" }] });

    try {
      const { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogStreamsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
      const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });
      const logGroup = `airflow-${process.env.MWAA_ENV_NAME || "bgp-mwaa"}-Task`;

      // Build stream prefix: Airflow replaces : with _ in log stream names
      const sanitizedRunId = runId?.replace(/:/g, "_");
      const prefix = sanitizedRunId ? `dag_id=${dagId}/run_id=${sanitizedRunId}/` : `dag_id=${dagId}/`;
      const { logStreams = [] } = await cwl.send(new DescribeLogStreamsCommand({
        logGroupName: logGroup, logStreamNamePrefix: prefix, limit: 20,
      }));

      if (!runId && logStreams.length > 0) {
        // No specific run: get latest run's streams
        const runIds = Array.from(new Set(logStreams.map(s => s.logStreamName?.split("/")[1] || "")));
        const latestRunId = runIds[runIds.length - 1];
        const filtered = logStreams.filter(s => s.logStreamName?.includes(latestRunId));
        return await fetchLogsFromStreams(cwl, logGroup, filtered);
      }

      return await fetchLogsFromStreams(cwl, logGroup, logStreams);
    } catch {}

    return NextResponse.json({ logs: [{ message: "暂无日志" }] });
  }

  return NextResponse.json({ logs: [], message: "暂无日志" });
}

async function fetchLogsFromStreams(cwl: any, logGroup: string, streams: any[]) {
  const { FilterLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
  const allLogs: any[] = [];
  for (const stream of streams.slice(0, 10)) {
    try {
      const { events = [] } = await cwl.send(new FilterLogEventsCommand({
        logGroupName: logGroup, logStreamNames: [stream.logStreamName!], limit: 200,
      }));
      for (const e of events) {
        allLogs.push({ timestamp: e.timestamp, message: e.message?.trim() });
      }
    } catch {}
  }
  allLogs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return NextResponse.json({ logs: allLogs.length > 0 ? allLogs : [{ message: "暂无日志" }] });
}

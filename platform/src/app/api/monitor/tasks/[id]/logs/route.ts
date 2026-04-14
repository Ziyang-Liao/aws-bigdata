export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  // Try sync task first
  const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }));

  if (task) {
    // Get latest run record
    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.TASK_RUNS,
      KeyConditionExpression: "taskId = :t",
      ExpressionAttributeValues: { ":t": params.id },
      ScanIndexForward: false,
      Limit: 1,
    }));

    const run = Items[0];
    if (run?.logS3Key) {
      // Read log from S3
      try {
        const bucket = process.env.GLUE_SCRIPTS_BUCKET || `bgp-glue-scripts-${process.env.AWS_ACCOUNT_ID}`;
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: run.logS3Key }));
        const text = await Body!.transformToString();
        return NextResponse.json({ logs: text.split("\n").map((line: string) => ({ message: line })) });
      } catch {}
    }

    // Fallback: try CloudWatch directly
    try {
      const { CloudWatchLogsClient, FilterLogEventsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
      const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });
      const jobName = task.glueJobName;
      if (jobName) {
        const { events = [] } = await cwl.send(new FilterLogEventsCommand({
          logGroupName: "/aws-glue/jobs/output",
          filterPattern: "",
          limit: 100,
        }));
        if (events.length > 0) {
          return NextResponse.json({ logs: events.map((e: any) => ({ timestamp: e.timestamp, message: e.message })) });
        }
      }
    } catch {}
  }

  // Try workflow
  const { Item: wf } = await docClient.send(new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } }));
  if (wf) {
    const dagId = wf.airflowDagId;
    if (!dagId) return NextResponse.json({ logs: [{ message: "工作流尚未发布" }] });

    try {
      const { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogStreamsCommand } = await import("@aws-sdk/client-cloudwatch-logs");
      const cwl = new CloudWatchLogsClient({ region: process.env.AWS_REGION || "us-east-1" });
      const envName = process.env.MWAA_ENV_NAME || "bgp-mwaa";
      const allLogs: any[] = [];
      const logGroup = `airflow-${envName}-Task`;

      // Find log streams matching this DAG
      const { logStreams = [] } = await cwl.send(new DescribeLogStreamsCommand({
        logGroupName: logGroup,
        logStreamNamePrefix: `dag_id=${dagId}/`,
        orderBy: "LastEventTime",
        descending: true,
        limit: 10,
      }));

      for (const stream of logStreams.slice(0, 5)) {
        try {
          const { events = [] } = await cwl.send(new FilterLogEventsCommand({
            logGroupName: logGroup,
            logStreamNames: [stream.logStreamName!],
            limit: 200,
          }));
          for (const e of events) {
            allLogs.push({ timestamp: e.timestamp, message: e.message?.trim() });
          }
        } catch {}
      }

      if (allLogs.length > 0) {
        allLogs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        return NextResponse.json({ logs: allLogs });
      }
    } catch {}

    return NextResponse.json({ logs: [{ message: "暂无日志，请触发运行后查看" }] });
  }

  return NextResponse.json({ logs: [], message: "暂无日志" });
}

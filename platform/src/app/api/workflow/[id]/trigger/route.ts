export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { MWAAClient, CreateCliTokenCommand } from "@aws-sdk/client-mwaa";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { ulid } from "ulid";

const USER_ID = "default-user";
const mwaa = new MWAAClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!Item.airflowDagId) return NextResponse.json({ error: "请先发布工作流" }, { status: 400 });

  const envName = process.env.MWAA_ENV_NAME || "bgp-mwaa";
  const dagId = Item.airflowDagId;
  const runId = ulid();
  const now = new Date().toISOString();

  try {
    // Use MWAA CLI token to trigger DAG via Airflow REST API
    const { CliToken, WebServerHostname } = await mwaa.send(
      new CreateCliTokenCommand({ Name: envName })
    );

    // Ensure DAG is unpaused before triggering
    await fetch(`https://${WebServerHostname}/aws_mwaa/cli`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CliToken}`, "Content-Type": "text/plain" },
      body: `dags unpause ${dagId}`,
    });

    const { CliToken: t2, WebServerHostname: h2 } = await mwaa.send(
      new CreateCliTokenCommand({ Name: envName })
    );
    const res = await fetch(`https://${h2}/aws_mwaa/cli`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t2}`, "Content-Type": "text/plain" },
      body: `dags trigger ${dagId} -r ${runId}`,
    });
    const result = await res.text();

    // Record run in DynamoDB
    await docClient.send(new PutCommand({
      TableName: TABLES.TASK_RUNS,
      Item: {
        taskId: params.id,
        runId,
        taskType: "workflow",
        status: "running",
        startedAt: now,
        triggeredBy: "manual",
        airflowDagId: dagId,
        airflowRunId: runId,
        result: result.slice(0, 500),
      },
    }));

    // Update workflow status
    await docClient.send(new UpdateCommand({
      TableName: TABLES.WORKFLOWS,
      Key: { userId: USER_ID, workflowId: params.id },
      UpdateExpression: "SET #s = :s, lastRunAt = :now, lastRunStatus = :rs, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "active", ":now": now, ":rs": "running" },
    }));

    return NextResponse.json({ success: true, dagId, runId, message: "已触发运行" });
  } catch (err: any) {
    return NextResponse.json({ error: `触发失败: ${err.message}` }, { status: 500 });
  }
}

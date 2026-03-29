import { NextRequest, NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!Item.airflowDagId) return NextResponse.json({ error: "请先发布工作流" }, { status: 400 });

  try {
    // Call MWAA Airflow REST API to trigger DAG
    const mwaaEnv = process.env.MWAA_ENV_NAME || "bgp-mwaa";
    const airflowUrl = process.env.MWAA_WEBSERVER_URL;

    if (airflowUrl) {
      const res = await fetch(`${airflowUrl}/api/v1/dags/${Item.airflowDagId}/dagRuns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conf: {} }),
      });
      const data = await res.json();
      return NextResponse.json({ success: true, dagRunId: data.dag_run_id });
    }

    return NextResponse.json({ success: true, message: "MWAA 未配置，已标记触发" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

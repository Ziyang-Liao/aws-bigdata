export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { generateAirflowDag } from "@/lib/workflow/dag-generator";
import type { Workflow } from "@/types/workflow";

const USER_ID = "default-user";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workflow = Item as unknown as Workflow;
  const dagId = `bgp_${workflow.workflowId}`;

  try {
    const dagContent = generateAirflowDag({ ...workflow, airflowDagId: dagId });
    const bucket = process.env.MWAA_DAG_BUCKET || "bgp-mwaa-dags";

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `dags/${dagId}.py`,
      Body: dagContent,
      ContentType: "text/x-python",
    }));

    await docClient.send(new UpdateCommand({
      TableName: TABLES.WORKFLOWS,
      Key: { userId: USER_ID, workflowId: params.id },
      UpdateExpression: "SET #s = :s, airflowDagId = :d, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": "active", ":d": dagId, ":now": new Date().toISOString() },
    }));

    // Auto-unpause DAG in MWAA
    try {
      const { MWAAClient, CreateCliTokenCommand } = await import("@aws-sdk/client-mwaa");
      const mwaa = new MWAAClient({ region: process.env.AWS_REGION || "us-east-1" });
      const { CliToken, WebServerHostname } = await mwaa.send(new CreateCliTokenCommand({ Name: process.env.MWAA_ENV_NAME || "bgp-mwaa" }));
      await fetch(`https://${WebServerHostname}/aws_mwaa/cli`, {
        method: "POST", headers: { Authorization: `Bearer ${CliToken}`, "Content-Type": "text/plain" },
        body: `dags unpause ${dagId}`,
      });
    } catch {}

    return NextResponse.json({ success: true, dagId, bucket });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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

    // Auto-unpause DAG in MWAA (wait for scheduler to pick up the DAG file)
    try {
      const { MWAAClient, CreateCliTokenCommand } = await import("@aws-sdk/client-mwaa");
      const mwaa = new MWAAClient({ region: process.env.AWS_REGION || "us-east-1" });
      const envName = process.env.MWAA_ENV_NAME || "bgp-mwaa";

      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 10000));
        const { CliToken, WebServerHostname } = await mwaa.send(new CreateCliTokenCommand({ Name: envName }));
        const res = await fetch(`https://${WebServerHostname}/aws_mwaa/cli`, {
          method: "POST", headers: { Authorization: `Bearer ${CliToken}`, "Content-Type": "text/plain" },
          body: `dags list -o json`,
        });
        const body = await res.json();
        const stdout = Buffer.from(body.stdout || "", "base64").toString();
        if (stdout.includes(dagId)) {
          // DAG loaded, now unpause
          const { CliToken: t2, WebServerHostname: h2 } = await mwaa.send(new CreateCliTokenCommand({ Name: envName }));
          await fetch(`https://${h2}/aws_mwaa/cli`, {
            method: "POST", headers: { Authorization: `Bearer ${t2}`, "Content-Type": "text/plain" },
            body: `dags unpause ${dagId}`,
          });
          break;
        }
      }
    } catch {}

    return NextResponse.json({ success: true, dagId, bucket });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

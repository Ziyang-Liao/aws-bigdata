export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { RedshiftServerlessClient, ListWorkgroupsCommand } from "@aws-sdk/client-redshift-serverless";

const client = new RedshiftServerlessClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET() {
  try {
    const { workgroups = [] } = await client.send(new ListWorkgroupsCommand({}));
    return NextResponse.json(workgroups.map((w) => ({
      workgroupName: w.workgroupName,
      status: w.status,
      endpoint: w.endpoint?.address,
      port: w.endpoint?.port,
      namespaceName: w.namespaceName,
    })));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

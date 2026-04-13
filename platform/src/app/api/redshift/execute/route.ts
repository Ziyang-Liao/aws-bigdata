export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { sql, workgroupName, database } = await req.json();
  try {
    const { Id } = await client.send(
      new ExecuteStatementCommand({
        Sql: sql,
        WorkgroupName: workgroupName || process.env.REDSHIFT_WORKGROUP || "bgp-workgroup",
        Database: database || "dev",
      })
    );
    return NextResponse.json({ statementId: Id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

async function runQuery(sql: string, workgroup: string, database: string) {
  const { Id } = await client.send(new ExecuteStatementCommand({ Sql: sql, WorkgroupName: workgroup, Database: database }));
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const desc = await client.send(new DescribeStatementCommand({ Id }));
    if (desc.Status === "FINISHED") {
      const result = await client.send(new GetStatementResultCommand({ Id }));
      return result.Records?.map((row) => row.map((cell) => Object.values(cell)[0])) || [];
    }
    if (desc.Status === "FAILED") throw new Error(desc.Error);
  }
  return [];
}

export async function GET(req: NextRequest) {
  const workgroup = req.nextUrl.searchParams.get("workgroup") || "bgp-workgroup";
  const database = req.nextUrl.searchParams.get("database") || "dev";

  try {
    const schemas = await runQuery("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','pg_catalog','pg_internal') ORDER BY schema_name;", workgroup, database);
    const tables = await runQuery("SELECT schemaname, tablename, tableowner FROM pg_tables WHERE schemaname NOT IN ('information_schema','pg_catalog','pg_internal') ORDER BY schemaname, tablename;", workgroup, database);

    return NextResponse.json({
      schemas: schemas.map((r) => ({ name: r[0] })),
      tables: tables.map((r) => ({ schema: r[0], table: r[1], owner: r[2] })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

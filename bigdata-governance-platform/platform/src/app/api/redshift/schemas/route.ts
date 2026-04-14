export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

async function runQuery(sql: string, workgroup: string, database: string) {
  const { Id } = await client.send(new ExecuteStatementCommand({ Sql: sql, WorkgroupName: workgroup, Database: database }));
  for (let i = 0; i < 30; i++) {
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
    // Single query to get schemas + tables + columns together
    const rows = await runQuery(`
      SELECT t.schemaname, t.tablename, t.tableowner,
             c.column_name, c.data_type, c.ordinal_position
      FROM pg_tables t
      LEFT JOIN information_schema.columns c
        ON c.table_schema = t.schemaname AND c.table_name = t.tablename
      WHERE t.schemaname NOT IN ('information_schema','pg_catalog','pg_internal','pg_automv')
      ORDER BY t.schemaname, t.tablename, c.ordinal_position
    `, workgroup, database);

    // Build structured response
    const schemaSet = new Set<string>();
    const tableMap: Record<string, { schema: string; table: string; owner: string; columns: any[] }> = {};

    for (const r of rows) {
      const schema = String(r[0]);
      const table = String(r[1]);
      const key = `${schema}.${table}`;
      schemaSet.add(schema);
      if (!tableMap[key]) {
        tableMap[key] = { schema, table, owner: String(r[2]), columns: [] };
      }
      if (r[3]) {
        tableMap[key].columns.push({ name: String(r[3]), type: String(r[4]), position: r[5] });
      }
    }

    return NextResponse.json({
      schemas: Array.from(schemaSet).map((s) => ({ name: s })),
      tables: Object.values(tableMap),
    });
  } catch (err: any) {
    return NextResponse.json({ schemas: [], tables: [], error: err.message }, { status: 200 });
  }
}

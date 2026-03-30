export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { mapAllColumns, generateDDL } from "@/lib/sync/sync-service";
import { apiOk, apiError } from "@/lib/api-response";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand } from "@aws-sdk/client-redshift-data";

const rs = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { sourceDb, tableName, columns, redshiftConfig } = await req.json();
  if (!tableName || !columns?.length) return apiError("缺少 tableName 或 columns");

  const mapped = mapAllColumns(sourceDb || "mysql", columns);
  const schema = redshiftConfig?.schema || "public";
  const fullName = `${schema}.${tableName}`;

  const ddl = generateDDL(fullName, mapped.map((m) => ({ target: m.target, targetType: m.targetType })), {
    distKey: redshiftConfig?.distKey,
    sortKeys: redshiftConfig?.sortKeys,
    distStyle: redshiftConfig?.distStyle,
  });

  // Quick check if table exists (non-blocking, 5s max)
  let tableExists = false;
  try {
    const wg = redshiftConfig?.workgroupName || process.env.REDSHIFT_WORKGROUP || "bgp-workgroup";
    const db = redshiftConfig?.database || "dev";
    const { Id } = await rs.send(new ExecuteStatementCommand({
      Sql: `SELECT 1 FROM information_schema.tables WHERE table_schema='${schema}' AND table_name='${tableName}' LIMIT 1`,
      WorkgroupName: wg, Database: db,
    }));
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const desc = await rs.send(new DescribeStatementCommand({ Id }));
      if (desc.Status === "FINISHED") { tableExists = (desc.ResultRows || 0) > 0; break; }
      if (desc.Status === "FAILED") break;
    }
  } catch {}

  return apiOk({ ddl, tableExists, columns: mapped });
}

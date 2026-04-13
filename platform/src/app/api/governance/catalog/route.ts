export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GlueClient, GetTablesCommand, GetDatabasesCommand } from "@aws-sdk/client-glue";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand } from "@aws-sdk/client-redshift-data";
import { apiOk, apiError } from "@/lib/api-response";

const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });
const rs = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword") || "";
  const catalog: any[] = [];

  // 1. Glue Data Catalog
  try {
    const { DatabaseList = [] } = await glue.send(new GetDatabasesCommand({}));
    for (const db of DatabaseList.slice(0, 5)) {
      try {
        const { TableList = [] } = await glue.send(new GetTablesCommand({ DatabaseName: db.Name }));
        for (const t of TableList) {
          if (!keyword || t.Name?.includes(keyword) || db.Name?.includes(keyword)) {
            catalog.push({
              fqn: `glue.${db.Name}.${t.Name}`,
              name: t.Name, database: db.Name, source: "Glue Data Catalog",
              columns: t.StorageDescriptor?.Columns?.length || 0,
              location: t.StorageDescriptor?.Location,
              format: t.StorageDescriptor?.InputFormat?.includes("parquet") ? "Parquet" : t.StorageDescriptor?.InputFormat?.includes("orc") ? "ORC" : "Other",
              updatedAt: t.UpdateTime?.toISOString(),
            });
          }
        }
      } catch {}
    }
  } catch {}

  // 2. Redshift tables
  try {
    const wg = process.env.REDSHIFT_WORKGROUP || "bgp-workgroup";
    const { Id } = await rs.send(new ExecuteStatementCommand({
      Sql: "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('information_schema','pg_catalog','pg_internal','pg_automv')",
      WorkgroupName: wg, Database: "dev",
    }));
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const desc = await rs.send(new DescribeStatementCommand({ Id }));
      if (desc.Status === "FINISHED") {
        const result = await rs.send(new GetStatementResultCommand({ Id }));
        for (const row of result.Records || []) {
          const schema = String(Object.values(row[0])[0]);
          const table = String(Object.values(row[1])[0]);
          if (!keyword || table.includes(keyword) || schema.includes(keyword)) {
            catalog.push({
              fqn: `redshift.dev.${schema}.${table}`,
              name: table, database: `dev.${schema}`, source: "Redshift",
              format: "Table", updatedAt: null,
            });
          }
        }
        break;
      }
      if (desc.Status === "FAILED") break;
    }
  } catch {}

  return apiOk(catalog);
}

import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand } from "@aws-sdk/client-redshift-data";

const rs = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { ddl, workgroupName, database } = await req.json();
  if (!ddl) return apiError("缺少 DDL");

  try {
    const wg = workgroupName || process.env.REDSHIFT_WORKGROUP || "bgp-workgroup";
    const { Id } = await rs.send(new ExecuteStatementCommand({ Sql: ddl, WorkgroupName: wg, Database: database || "dev" }));

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const desc = await rs.send(new DescribeStatementCommand({ Id }));
      if (desc.Status === "FINISHED") return apiOk({ success: true });
      if (desc.Status === "FAILED") return apiError(desc.Error || "DDL 执行失败");
    }
    return apiError("DDL 执行超时");
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

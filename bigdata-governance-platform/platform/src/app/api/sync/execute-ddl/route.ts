export const dynamic = "force-dynamic";
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

    // DDL statements finish quickly, poll with shorter intervals
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const desc = await rs.send(new DescribeStatementCommand({ Id }));
      if (desc.Status === "FINISHED") return apiOk({ success: true, statementId: Id });
      if (desc.Status === "FAILED") return apiError(`DDL 执行失败: ${desc.Error}`);
    }

    // If still not done after 15s, return the statement ID so frontend can poll
    return apiOk({ success: true, statementId: Id, message: "DDL 已提交，正在执行中" });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

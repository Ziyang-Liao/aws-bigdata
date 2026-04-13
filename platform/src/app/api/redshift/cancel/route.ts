export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { RedshiftDataClient, CancelStatementCommand } from "@aws-sdk/client-redshift-data";
import { apiOk, apiError } from "@/lib/api-response";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function POST(req: NextRequest) {
  const { statementId } = await req.json();
  if (!statementId) return apiError("缺少 statementId");
  try {
    await client.send(new CancelStatementCommand({ Id: statementId }));
    return apiOk({ cancelled: true });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { getLineage } from "@/lib/governance/lineage-service";
import { apiOk, apiError } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const fqn = req.nextUrl.searchParams.get("fqn");
  const depth = parseInt(req.nextUrl.searchParams.get("depth") || "2");
  if (!fqn) return apiError("缺少 fqn 参数");

  try {
    const lineage = await getLineage(fqn, depth);
    return apiOk(lineage);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.OPENMETADATA_URL || "";
  if (!url) return NextResponse.json({ error: "OPENMETADATA_URL 未配置，请先部署 OpenMetadata 服务" });

  // Health check
  try {
    const res = await fetch(`${url}/api/v1/system/version`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const version = await res.json();
      return NextResponse.json({ url, version: version.version });
    }
    return NextResponse.json({ error: "OpenMetadata 服务未就绪" });
  } catch {
    return NextResponse.json({ error: "无法连接 OpenMetadata 服务" });
  }
}

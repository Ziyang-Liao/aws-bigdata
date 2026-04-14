export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const OM_URL = process.env.OPENMETADATA_URL || "";

export async function GET(req: NextRequest) {
  if (!OM_URL) return new NextResponse("OpenMetadata not configured", { status: 503 });

  const path = req.nextUrl.searchParams.get("path") || "/";
  try {
    const res = await fetch(`${OM_URL}${path}`, {
      headers: { "Accept": req.headers.get("accept") || "*/*" },
    });
    const contentType = res.headers.get("content-type") || "text/html";
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch (e: any) {
    return new NextResponse(`Proxy error: ${e.message}`, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!OM_URL) return new NextResponse("OpenMetadata not configured", { status: 503 });

  const path = req.nextUrl.searchParams.get("path") || "/";
  try {
    const body = await req.text();
    const res = await fetch(`${OM_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": req.headers.get("content-type") || "application/json", "Accept": req.headers.get("accept") || "*/*" },
      body,
    });
    const contentType = res.headers.get("content-type") || "application/json";
    const resBody = await res.arrayBuffer();
    return new NextResponse(resBody, {
      status: res.status,
      headers: { "Content-Type": contentType },
    });
  } catch (e: any) {
    return new NextResponse(`Proxy error: ${e.message}`, { status: 502 });
  }
}

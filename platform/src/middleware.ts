import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Proxy /om/* to OpenMetadata internal ALB
  if (pathname.startsWith("/om")) {
    const omUrl = process.env.OPENMETADATA_URL;
    if (!omUrl) return NextResponse.next();

    const omPath = pathname.replace(/^\/om/, "") || "/";
    const target = `${omUrl}${omPath}${req.nextUrl.search}`;
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/om/:path*"],
};

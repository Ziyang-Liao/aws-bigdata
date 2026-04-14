import { NextRequest, NextResponse } from "next/server";

const OM_PATHS = ["/om", "/assets/", "/favicons/", "/swagger", "/api/v1/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const omUrl = process.env.OPENMETADATA_URL;
  if (!omUrl) return NextResponse.next();

  // Proxy /om/* - strip /om prefix
  if (pathname.startsWith("/om")) {
    const omPath = pathname.replace(/^\/om/, "") || "/";
    return NextResponse.rewrite(`${omUrl}${omPath}${req.nextUrl.search}`);
  }

  // Proxy OM static assets and API (absolute paths from OM HTML)
  if (pathname.startsWith("/assets/") || pathname.startsWith("/favicons/") || pathname.startsWith("/favicon.png") || pathname.startsWith("/swagger")) {
    return NextResponse.rewrite(`${omUrl}${pathname}${req.nextUrl.search}`);
  }

  // Proxy OM API v1 calls from OM frontend
  if (pathname.startsWith("/api/v1/")) {
    return NextResponse.rewrite(`${omUrl}${pathname}${req.nextUrl.search}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/om/:path*", "/assets/:path*", "/favicons/:path*", "/favicon.png", "/swagger/:path*", "/api/v1/:path*"],
};

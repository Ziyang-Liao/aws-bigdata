import { NextRequest } from "next/server";

export function getUserId(req: NextRequest): string {
  // Try Cognito JWT token
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = JSON.parse(Buffer.from(auth.split(".")[1], "base64").toString());
      return payload.sub || payload["cognito:username"] || "default-user";
    } catch {}
  }
  return "default-user";
}

export function getUserGroups(req: NextRequest): string[] {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = JSON.parse(Buffer.from(auth.split(".")[1], "base64").toString());
      return payload["cognito:groups"] || [];
    } catch {}
  }
  return ["bgp-admin"]; // Default to admin when no auth
}

export function isAdmin(req: NextRequest): boolean {
  return getUserGroups(req).includes("bgp-admin");
}

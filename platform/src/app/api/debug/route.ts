import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    allEnvKeys: Object.keys(process.env).filter(k => k.includes("COGNITO") || k.includes("GLUE") || k.includes("AWS") || k.includes("VPC") || k.includes("REDSHIFT") || k.includes("MWAA") || k.includes("DEFAULT")),
    COGNITO: process.env["COGNITO_USER_POOL_ID"],
    AWS_REGION: process.env["AWS_REGION"],
    NODE_ENV: process.env["NODE_ENV"],
    HOME: process.env["HOME"],
  });
}

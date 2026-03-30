export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { RedshiftDataClient, ListDatabasesCommand } from "@aws-sdk/client-redshift-data";

const client = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(req: NextRequest) {
  const workgroup = req.nextUrl.searchParams.get("workgroup") || "bgp-workgroup";
  try {
    const { Databases = [] } = await client.send(
      new ListDatabasesCommand({ WorkgroupName: workgroup, Database: "dev" })
    );
    return NextResponse.json(Databases.map((d) => ({ name: d })));
  } catch (err: any) {
    return NextResponse.json([{ name: "dev" }]);
  }
}

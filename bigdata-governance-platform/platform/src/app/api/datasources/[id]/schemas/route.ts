export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { GlueClient, GetConnectionCommand } from "@aws-sdk/client-glue";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";
const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item: ds } = await docClient.send(
    new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
  );
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (ds.glueConnectionName) {
      const { Connection } = await glue.send(new GetConnectionCommand({ Name: ds.glueConnectionName }));
      const jdbcUrl = Connection?.ConnectionProperties?.JDBC_CONNECTION_URL || "";
      const dbName = jdbcUrl.split("/").pop()?.split("?")[0] || ds.database;
      return NextResponse.json([{ name: dbName, isDefault: true }]);
    }
    return NextResponse.json([{ name: ds.database, isDefault: true }]);
  } catch (err: any) {
    return NextResponse.json([{ name: ds.database, isDefault: true }]);
  }
}

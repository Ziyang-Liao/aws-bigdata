export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { getSecret } from "@/lib/aws/datasource-service";
import mysql from "mysql2/promise";

const USER_ID = "default-user";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { Item: ds } = await docClient.send(
    new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
  );
  if (!ds) return NextResponse.json([]);

  const database = req.nextUrl.searchParams.get("database") || ds.database;

  // Get credentials from Secrets Manager
  let username = ds.username || "admin";
  let password = "";
  if (ds.secretArn) {
    try {
      const secret = await getSecret(ds.secretArn);
      username = secret.username;
      password = secret.password;
    } catch {}
  }

  // Query source database INFORMATION_SCHEMA directly
  try {
    const conn = await mysql.createConnection({
      host: ds.host, port: ds.port || 3306, user: username, password, database,
      connectTimeout: 10000,
    });

    const [rows] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [database]
    );

    await conn.end();

    // Group by table
    const tableMap: Record<string, any> = {};
    for (const row of rows as any[]) {
      if (!tableMap[row.TABLE_NAME]) {
        tableMap[row.TABLE_NAME] = { name: row.TABLE_NAME, database, columns: [] };
      }
      tableMap[row.TABLE_NAME].columns.push({
        name: row.COLUMN_NAME,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === "YES",
        key: row.COLUMN_KEY || undefined,
        comment: row.COLUMN_COMMENT || undefined,
      });
    }

    return NextResponse.json(Object.values(tableMap));
  } catch (e: any) {
    return NextResponse.json({ error: `无法连接源数据库: ${e.message}` }, { status: 500 });
  }
}

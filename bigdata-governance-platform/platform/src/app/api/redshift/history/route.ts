export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/aws/dynamodb";
import { apiOk } from "@/lib/api-response";
import { ulid } from "ulid";

const TABLE = "bgp-sql-history";
const USER_ID = "default-user";

export async function GET() {
  try {
    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": USER_ID }, ScanIndexForward: false, Limit: 100,
    }));
    return apiOk(Items);
  } catch {
    return apiOk([]);
  }
}

export async function POST(req: NextRequest) {
  const { sql, status, duration, rowCount, error } = await req.json();
  const item = { userId: USER_ID, historyId: ulid(), sql, status, duration, rowCount, error, createdAt: new Date().toISOString() };
  try {
    await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  } catch {}
  return apiOk(item);
}

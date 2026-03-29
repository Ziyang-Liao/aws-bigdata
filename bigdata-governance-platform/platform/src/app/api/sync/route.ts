import { NextRequest, NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { ulid } from "ulid";

const USER_ID = "default-user";

export async function GET() {
  const { Items = [] } = await docClient.send(
    new ScanCommand({
      TableName: TABLES.SYNC_TASKS,
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": USER_ID },
    })
  );
  return NextResponse.json(Items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const item = {
    userId: USER_ID,
    taskId: ulid(),
    ...body,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLES.SYNC_TASKS, Item: item }));
  return NextResponse.json(item, { status: 201 });
}

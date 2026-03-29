import { ddb, Tables } from "@/lib/aws/dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest, NextResponse } from "next/server";

// GET /api/sync - 列表
export async function GET() {
  const userId = "default";
  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: Tables.SYNC_TASKS,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
  );
  return NextResponse.json(Items);
}

// POST /api/sync - 创建
export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = "default";
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();

  const item = {
    userId,
    taskId,
    name: body.name,
    datasourceId: body.datasourceId,
    sourceDatabase: body.sourceDatabase,
    sourceTables: body.sourceTables || [],
    targetType: body.targetType || "s3-tables",
    s3Config: body.s3Config || null,
    redshiftConfig: body.redshiftConfig || null,
    syncMode: body.syncMode || "full",
    writeMode: body.writeMode || "append",
    mergeKeys: body.mergeKeys || [],
    channel: body.channel || "glue",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: Tables.SYNC_TASKS, Item: item }));
  return NextResponse.json(item, { status: 201 });
}

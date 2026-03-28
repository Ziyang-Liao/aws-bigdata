import { ddb, Tables } from "@/lib/aws/dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest, NextResponse } from "next/server";

// GET /api/datasources - 列表
export async function GET() {
  // TODO: 从 token 获取 userId，暂时硬编码
  const userId = "default";
  const { Items = [] } = await ddb.send(
    new QueryCommand({
      TableName: Tables.DATASOURCES,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    })
  );
  return NextResponse.json(Items);
}

// POST /api/datasources - 创建
export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = "default";
  const datasourceId = crypto.randomUUID();
  const now = new Date().toISOString();

  const item = {
    userId,
    datasourceId,
    name: body.name,
    type: body.type,
    host: body.host,
    port: body.port,
    database: body.database,
    username: body.username,
    credentialArn: "", // TODO: 存到 Secrets Manager
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: Tables.DATASOURCES, Item: item }));
  return NextResponse.json(item, { status: 201 });
}

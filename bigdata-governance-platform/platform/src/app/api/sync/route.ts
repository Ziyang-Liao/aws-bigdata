import { NextRequest } from "next/server";
import { PutCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";
import { generateSyncLineage } from "@/lib/governance/lineage-service";
import { ulid } from "ulid";

const USER_ID = "default-user";

export async function GET() {
  try {
    const { Items = [] } = await docClient.send(
      new ScanCommand({ TableName: TABLES.SYNC_TASKS, FilterExpression: "userId = :uid", ExpressionAttributeValues: { ":uid": USER_ID } })
    );
    return apiOk(Items);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
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
  try {
    await docClient.send(new PutCommand({ TableName: TABLES.SYNC_TASKS, Item: item }));

    // Auto-generate lineage (GOV-02)
    if (item.datasourceId) {
      const { Item: ds } = await docClient.send(new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: item.datasourceId } }));
      if (ds) generateSyncLineage(item, ds).catch(() => {});
    }

    return apiOk(item, 201);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { PutCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";
import { generateSyncLineage } from "@/lib/governance/lineage-service";
import { ulid } from "ulid";

const USER_ID = "default-user";

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const name = p.get("name") || "";
    const status = p.get("status") || "";
    const scheduleEnabled = p.get("scheduleEnabled") || "";
    const channel = p.get("channel") || "";
    const syncMode = p.get("syncMode") || "";
    const targetType = p.get("targetType") || "";

    const filterParts: string[] = ["userId = :uid"];
    const attrNames: Record<string, string> = {};
    const attrValues: Record<string, any> = { ":uid": USER_ID };

    if (status) { filterParts.push("#st = :st"); attrNames["#st"] = "status"; attrValues[":st"] = status; }
    if (name) { filterParts.push("contains(#nm, :nm)"); attrNames["#nm"] = "name"; attrValues[":nm"] = name; }
    if (channel) { filterParts.push("channel = :ch"); attrValues[":ch"] = channel; }
    if (syncMode) { filterParts.push("syncMode = :sm"); attrValues[":sm"] = syncMode; }
    if (targetType) { filterParts.push("targetType = :tt"); attrValues[":tt"] = targetType; }
    if (scheduleEnabled === "true") { filterParts.push("scheduleEnabled = :se"); attrValues[":se"] = true; }
    else if (scheduleEnabled === "false") { filterParts.push("(attribute_not_exists(scheduleEnabled) OR scheduleEnabled = :se)"); attrValues[":se"] = false; }

    const { Items = [] } = await docClient.send(new ScanCommand({
      TableName: TABLES.SYNC_TASKS,
      FilterExpression: filterParts.join(" AND "),
      ...(Object.keys(attrNames).length > 0 ? { ExpressionAttributeNames: attrNames } : {}),
      ExpressionAttributeValues: attrValues,
    }));
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

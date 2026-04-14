export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { ulid } from "ulid";

const USER_ID = "default-user";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const name = p.get("name") || "";
  const status = p.get("status") || "";
  const cron = p.get("cron") || "";

  const filterParts: string[] = ["userId = :uid"];
  const attrNames: Record<string, string> = {};
  const attrValues: Record<string, any> = { ":uid": USER_ID };

  if (status) {
    filterParts.push("#st = :st");
    attrNames["#st"] = "status";
    attrValues[":st"] = status;
  }
  if (name) {
    filterParts.push("contains(#nm, :nm)");
    attrNames["#nm"] = "name";
    attrValues[":nm"] = name;
  }
  if (cron === "configured") {
    filterParts.push("attribute_exists(cronExpression) AND cronExpression <> :empty");
    attrValues[":empty"] = null;
  } else if (cron === "none") {
    filterParts.push("(attribute_not_exists(cronExpression) OR cronExpression = :empty)");
    attrValues[":empty"] = null;
  }

  const { Items = [] } = await docClient.send(new ScanCommand({
    TableName: TABLES.WORKFLOWS,
    FilterExpression: filterParts.join(" AND "),
    ...(Object.keys(attrNames).length > 0 ? { ExpressionAttributeNames: attrNames } : {}),
    ExpressionAttributeValues: attrValues,
  }));
  return NextResponse.json(Items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const item = {
    userId: USER_ID,
    workflowId: ulid(),
    dagDefinition: { nodes: [], edges: [] },
    scheduleEnabled: false,
    status: "draft",
    ...body,
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TABLES.WORKFLOWS, Item: item }));
  return NextResponse.json(item, { status: 201 });
}

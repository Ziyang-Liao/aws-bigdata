export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(Item);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const fields = Object.keys(body);
  const expr = fields.map((k, i) => `#f${i} = :v${i}`).join(", ");
  const names = Object.fromEntries(fields.map((k, i) => [`#f${i}`, k]));
  const values = Object.fromEntries(fields.map((k, i) => [`:v${i}`, body[k]]));

  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: TABLES.WORKFLOWS,
      Key: { userId: USER_ID, workflowId: params.id },
      UpdateExpression: `SET ${expr}, #upd = :now`,
      ExpressionAttributeNames: { ...names, "#upd": "updatedAt" },
      ExpressionAttributeValues: { ...values, ":now": new Date().toISOString() },
      ReturnValues: "ALL_NEW",
    })
  );
  return NextResponse.json(Attributes);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await docClient.send(
    new DeleteCommand({ TableName: TABLES.WORKFLOWS, Key: { userId: USER_ID, workflowId: params.id } })
  );
  return NextResponse.json({ success: true });
}

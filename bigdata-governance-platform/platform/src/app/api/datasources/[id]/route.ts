import { ddb, Tables } from "@/lib/aws/dynamodb";
import { GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/datasources/:id
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { Item } = await ddb.send(
    new GetCommand({ TableName: Tables.DATASOURCES, Key: { userId: "default", datasourceId: id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(Item);
}

// PUT /api/datasources/:id
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const now = new Date().toISOString();

  const { Attributes } = await ddb.send(
    new UpdateCommand({
      TableName: Tables.DATASOURCES,
      Key: { userId: "default", datasourceId: id },
      UpdateExpression: "SET #n = :n, #t = :t, host = :h, port = :p, #db = :db, username = :u, updatedAt = :ua",
      ExpressionAttributeNames: { "#n": "name", "#t": "type", "#db": "database" },
      ExpressionAttributeValues: {
        ":n": body.name, ":t": body.type, ":h": body.host,
        ":p": body.port, ":db": body.database, ":u": body.username, ":ua": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return NextResponse.json(Attributes);
}

// DELETE /api/datasources/:id
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await ddb.send(
    new DeleteCommand({ TableName: Tables.DATASOURCES, Key: { userId: "default", datasourceId: id } })
  );
  return NextResponse.json({ success: true });
}

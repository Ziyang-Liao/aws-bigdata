import { ddb, Tables } from "@/lib/aws/dynamodb";
import { GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/sync/:id
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { Item } = await ddb.send(
    new GetCommand({ TableName: Tables.SYNC_TASKS, Key: { userId: "default", taskId: id } })
  );
  if (!Item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(Item);
}

// PUT /api/sync/:id
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const now = new Date().toISOString();

  const { Attributes } = await ddb.send(
    new UpdateCommand({
      TableName: Tables.SYNC_TASKS,
      Key: { userId: "default", taskId: id },
      UpdateExpression: `SET #n = :n, datasourceId = :ds, sourceDatabase = :sdb, sourceTables = :st,
        targetType = :tt, s3Config = :s3, redshiftConfig = :rs, syncMode = :sm,
        writeMode = :wm, mergeKeys = :mk, channel = :ch, updatedAt = :ua`,
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":n": body.name, ":ds": body.datasourceId, ":sdb": body.sourceDatabase,
        ":st": body.sourceTables, ":tt": body.targetType, ":s3": body.s3Config || null,
        ":rs": body.redshiftConfig || null, ":sm": body.syncMode, ":wm": body.writeMode,
        ":mk": body.mergeKeys || [], ":ch": body.channel, ":ua": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return NextResponse.json(Attributes);
}

// DELETE /api/sync/:id
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await ddb.send(
    new DeleteCommand({ TableName: Tables.SYNC_TASKS, Key: { userId: "default", taskId: id } })
  );
  return NextResponse.json({ success: true });
}

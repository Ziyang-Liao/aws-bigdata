export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { deleteSecret, deleteGlueConnection, deleteSecurityGroup, updateSecret } from "@/lib/aws/datasource-service";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item } = await docClient.send(
      new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
    );
    if (!Item) return apiError("数据源不存在", 404);
    return apiOk(Item);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    // If password is being updated, update Secrets Manager too
    if (body.password) {
      const { Item } = await docClient.send(
        new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
      );
      if (Item?.secretArn) {
        await updateSecret(Item.secretArn, body.username || Item.username, body.password);
      }
      delete body.password; // Don't store in DynamoDB
    }

    const fields = Object.keys(body);
    if (fields.length === 0) return apiError("无更新字段");

    const expr = fields.map((k, i) => `#f${i} = :v${i}`).join(", ");
    const names = Object.fromEntries(fields.map((k, i) => [`#f${i}`, k]));
    const values = Object.fromEntries(fields.map((k, i) => [`:v${i}`, body[k]]));

    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLES.DATASOURCES,
        Key: { userId: USER_ID, datasourceId: params.id },
        UpdateExpression: `SET ${expr}, #upd = :now`,
        ExpressionAttributeNames: { ...names, "#upd": "updatedAt" },
        ExpressionAttributeValues: { ...values, ":now": new Date().toISOString() },
        ReturnValues: "ALL_NEW",
      })
    );
    return apiOk(Attributes);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get datasource to find resources to clean up
    const { Item } = await docClient.send(
      new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
    );

    if (Item) {
      // Clean up provisioned resources
      if (Item.glueConnectionName) await deleteGlueConnection(Item.glueConnectionName);
      if (Item.secretArn) await deleteSecret(Item.secretArn);
      if (Item.networkConfig?.securityGroupId) await deleteSecurityGroup(Item.networkConfig.securityGroupId);
    }

    await docClient.send(
      new DeleteCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: params.id } })
    );
    return apiOk({ deleted: true });
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { testConnection, createSecret, detectNetwork, createGlueConnection, deleteGlueConnection, deleteSecret, deleteSecurityGroup } from "@/lib/aws/datasource-service";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // If datasourceId provided, test existing datasource
  if (body.datasourceId) {
    try {
      const { Item } = await docClient.send(
        new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: body.datasourceId } })
      );
      if (!Item?.glueConnectionName) return apiError("数据源未关联 Glue Connection");

      const result = await testConnection(Item.glueConnectionName);

      // Update test result in DynamoDB
      await docClient.send(new UpdateCommand({
        TableName: TABLES.DATASOURCES,
        Key: { userId: USER_ID, datasourceId: body.datasourceId },
        UpdateExpression: "SET #s = :s, testResult = :tr, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": result.success ? "active" : "error",
          ":tr": { ...result, testedAt: new Date().toISOString() },
          ":now": new Date().toISOString(),
        },
      }));

      return apiOk(result);
    } catch (e: any) {
      return apiError(e.message, 500);
    }
  }

  // Otherwise, test with provided credentials (for new datasource form)
  const { type, host, port, database, username, password } = body;
  if (!type || !host || !port || !database || !username || !password) {
    return apiError("缺少必填字段");
  }

  const tempId = `test-${Date.now()}`;
  let secretArn: string | undefined;
  let networkConfig: any;
  let connName: string | undefined;

  try {
    secretArn = await createSecret(tempId, username, password);
    networkConfig = await detectNetwork(host, type, tempId);
    connName = await createGlueConnection(tempId, type, host, port, database, secretArn, networkConfig);
    const result = await testConnection(connName);
    return apiOk(result);
  } catch (e: any) {
    return apiOk({
      success: false,
      steps: [{ name: "setup", status: "fail", message: e.message }],
      totalMs: 0,
    });
  } finally {
    // Clean up temp resources
    if (connName) await deleteGlueConnection(connName);
    if (secretArn) await deleteSecret(secretArn);
    if (networkConfig?.securityGroupId) await deleteSecurityGroup(networkConfig.securityGroupId);
  }
}

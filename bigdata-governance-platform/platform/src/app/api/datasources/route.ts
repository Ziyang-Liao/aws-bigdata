export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { createSecret, detectNetwork, ensureGlueRole, createGlueConnection, testConnection } from "@/lib/aws/datasource-service";
import { apiOk, apiError } from "@/lib/api-response";
import { ulid } from "ulid";

const USER_ID = "default-user"; // TODO: AUTH-01 replace with Cognito

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const name = p.get("name") || "";
    const type = p.get("type") || "";
    const status = p.get("status") || "";
    const hasGlue = p.get("hasGlue") || "";
    const hasSecret = p.get("hasSecret") || "";

    const filterParts: string[] = ["userId = :uid"];
    const attrNames: Record<string, string> = {};
    const attrValues: Record<string, any> = { ":uid": USER_ID };

    if (name) { filterParts.push("contains(#nm, :nm)"); attrNames["#nm"] = "name"; attrValues[":nm"] = name; }
    if (type) { filterParts.push("#tp = :tp"); attrNames["#tp"] = "type"; attrValues[":tp"] = type; }
    if (status) { filterParts.push("#st = :st"); attrNames["#st"] = "status"; attrValues[":st"] = status; }
    if (hasGlue === "true") { filterParts.push("attribute_exists(glueConnectionName)"); }
    else if (hasGlue === "false") { filterParts.push("attribute_not_exists(glueConnectionName)"); }
    if (hasSecret === "true") { filterParts.push("attribute_exists(secretArn)"); }
    else if (hasSecret === "false") { filterParts.push("attribute_not_exists(secretArn)"); }

    const { Items = [] } = await docClient.send(new ScanCommand({
      TableName: TABLES.DATASOURCES,
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
  const { name, type, host, port, database, username, password, env, tags } = body;

  if (!name || !type || !host || !port || !database || !username || !password) {
    return apiError("缺少必填字段: name, type, host, port, database, username, password");
  }

  const datasourceId = ulid();
  const now = new Date().toISOString();

  try {
    // Step 1: DS-04 — Store password in Secrets Manager
    const secretArn = await createSecret(datasourceId, username, password);

    // Step 2: DS-02 — Ensure Glue IAM Role exists
    await ensureGlueRole();

    // Step 3: DS-03 — Auto-detect network & create security group
    const networkConfig = await detectNetwork(host, type, datasourceId);

    // Step 4: DS-01 — Create Glue Connection
    const glueConnectionName = await createGlueConnection(datasourceId, type, host, port, database, secretArn, networkConfig);

    // Step 5: Save to DynamoDB (no password stored!)
    const item = {
      userId: USER_ID,
      datasourceId,
      name,
      type,
      host,
      port,
      database,
      username,
      status: "testing" as const,
      env: env || "",
      tags: tags || [],
      secretArn,
      glueConnectionName,
      networkConfig: {
        vpcId: networkConfig.vpcId,
        subnetId: networkConfig.subnetId,
        securityGroupId: networkConfig.securityGroupId,
        isRds: networkConfig.isRds,
        rdsInstanceId: networkConfig.rdsInstanceId,
      },
      createdAt: now,
      updatedAt: now,
    };
    await docClient.send(new PutCommand({ TableName: TABLES.DATASOURCES, Item: item }));

    // Step 6: DS-16 — Test connection (async, don't block response)
    testConnection(glueConnectionName).then(async (result) => {
      const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
      await docClient.send(new UpdateCommand({
        TableName: TABLES.DATASOURCES,
        Key: { userId: USER_ID, datasourceId },
        UpdateExpression: "SET #s = :s, testResult = :tr, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": result.success ? "active" : "error",
          ":tr": { ...result, testedAt: new Date().toISOString() },
          ":now": new Date().toISOString(),
        },
      }));
    }).catch(() => {});

    return apiOk({
      ...item,
      provisionedResources: {
        secretArn,
        glueConnectionName,
        securityGroupId: networkConfig.securityGroupId,
        vpcId: networkConfig.vpcId,
        subnetId: networkConfig.subnetId,
      },
    }, 201);
  } catch (e: any) {
    return apiError(`创建数据源失败: ${e.message}`, 500);
  }
}

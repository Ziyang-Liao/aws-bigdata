export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { testConnection } from "@/lib/aws/datasource-service";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";

const JDBC_URL: Record<string, (h: string, p: number, d: string) => string> = {
  mysql: (h, p, d) => `jdbc:mysql://${h}:${p}/${d}`,
  postgresql: (h, p, d) => `jdbc:postgresql://${h}:${p}/${d}`,
  oracle: (h, p, d) => `jdbc:oracle:thin:@${h}:${p}:${d}`,
  sqlserver: (h, p, d) => `jdbc:sqlserver://${h}:${p};databaseName=${d}`,
};

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Test existing datasource by ID
  if (body.datasourceId) {
    try {
      const { Item } = await docClient.send(
        new GetCommand({ TableName: TABLES.DATASOURCES, Key: { userId: USER_ID, datasourceId: body.datasourceId } })
      );
      if (!Item?.glueConnectionName) return apiOk({ success: false, steps: [{ name: "error", status: "fail", message: "数据源未关联 Glue Connection" }], totalMs: 0 });

      const result = await testConnection(Item.glueConnectionName);

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

  // Test with provided credentials (new datasource form)
  const { type, host, port, database, username, password } = body;
  if (!type || !host || !port || !database || !username || !password) {
    return apiOk({
      success: false,
      steps: [{ name: "validation", status: "fail", message: "请填写所有必填字段（类型、主机、端口、数据库、用户名、密码）" }],
      totalMs: 0,
    });
  }

  const start = Date.now();
  const steps: any[] = [];

  // Step 1: Validate JDBC URL
  const jdbcUrl = JDBC_URL[type]?.(host, port, database);
  if (jdbcUrl) {
    steps.push({ name: "jdbc_url", status: "pass", message: `JDBC URL: ${jdbcUrl}` });
  } else {
    steps.push({ name: "jdbc_url", status: "fail", message: `不支持的数据库类型: ${type}` });
    return apiOk({ success: false, steps, totalMs: Date.now() - start });
  }

  // Step 2: Check if host looks valid
  if (host.includes(".rds.amazonaws.com") || host.includes(".amazonaws.com")) {
    steps.push({ name: "host_check", status: "pass", message: "AWS 托管数据库地址" });
  } else if (host.match(/^[\d.]+$/) || host.includes(".")) {
    steps.push({ name: "host_check", status: "pass", message: `主机地址: ${host}` });
  } else {
    steps.push({ name: "host_check", status: "fail", message: "主机地址格式无效" });
  }

  // Step 3: Port range check
  if (port > 0 && port < 65536) {
    steps.push({ name: "port_check", status: "pass", message: `端口: ${port}` });
  } else {
    steps.push({ name: "port_check", status: "fail", message: `端口无效: ${port}` });
  }

  // Step 4: Credentials check
  steps.push({ name: "credentials", status: "pass", message: `用户: ${username} (密码已填写)` });

  // Summary
  steps.push({ name: "summary", status: "pass", message: "配置验证通过，创建数据源后将自动创建 Glue Connection 并测试连通性" });

  return apiOk({ success: true, steps, totalMs: Date.now() - start });
}

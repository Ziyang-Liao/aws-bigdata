import { glue } from "@/lib/aws/glue";
import { CreateConnectionCommand, DeleteConnectionCommand, GetConnectionCommand } from "@aws-sdk/client-glue";
import { NextRequest, NextResponse } from "next/server";

// POST /api/datasources/test - 测试连通性
export async function POST(req: NextRequest) {
  const body = await req.json();
  const connName = `bgp-test-${Date.now()}`;

  const jdbcUrl = buildJdbcUrl(body.type, body.host, body.port, body.database);

  try {
    // 创建临时 Glue Connection 来测试
    await glue.send(
      new CreateConnectionCommand({
        ConnectionInput: {
          Name: connName,
          ConnectionType: "JDBC",
          ConnectionProperties: {
            JDBC_CONNECTION_URL: jdbcUrl,
            USERNAME: body.username,
            PASSWORD: body.password,
          },
        },
      })
    );

    // 验证连接是否创建成功
    await glue.send(new GetConnectionCommand({ Name: connName }));

    // 清理临时连接
    await glue.send(new DeleteConnectionCommand({ ConnectionName: connName }));

    return NextResponse.json({ success: true, message: "连接成功" });
  } catch (err: unknown) {
    // 清理
    try { await glue.send(new DeleteConnectionCommand({ ConnectionName: connName })); } catch {}
    const message = err instanceof Error ? err.message : "连接失败";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

function buildJdbcUrl(type: string, host: string, port: number, database: string): string {
  switch (type) {
    case "mysql": return `jdbc:mysql://${host}:${port}/${database}`;
    case "postgresql": return `jdbc:postgresql://${host}:${port}/${database}`;
    case "oracle": return `jdbc:oracle:thin:@${host}:${port}:${database}`;
    case "sqlserver": return `jdbc:sqlserver://${host}:${port};databaseName=${database}`;
    default: return `jdbc:mysql://${host}:${port}/${database}`;
  }
}

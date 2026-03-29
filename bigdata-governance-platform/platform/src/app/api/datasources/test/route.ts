import { NextRequest, NextResponse } from "next/server";
import { GlueClient, CreateConnectionCommand, GetConnectionCommand, DeleteConnectionCommand } from "@aws-sdk/client-glue";

const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

const JDBC_URL: Record<string, (h: string, p: number, d: string) => string> = {
  mysql: (h, p, d) => `jdbc:mysql://${h}:${p}/${d}`,
  postgresql: (h, p, d) => `jdbc:postgresql://${h}:${p}/${d}`,
  oracle: (h, p, d) => `jdbc:oracle:thin:@${h}:${p}:${d}`,
  sqlserver: (h, p, d) => `jdbc:sqlserver://${h}:${p};databaseName=${d}`,
};

export async function POST(req: NextRequest) {
  const { type, host, port, database, username, password } = await req.json();
  const connName = `bgp-test-${Date.now()}`;

  try {
    await glue.send(
      new CreateConnectionCommand({
        ConnectionInput: {
          Name: connName,
          ConnectionType: "JDBC",
          ConnectionProperties: {
            JDBC_CONNECTION_URL: JDBC_URL[type]?.(host, port, database) || "",
            USERNAME: username,
            PASSWORD: password,
          },
        },
      })
    );
    // If creation succeeds, connection config is valid
    await glue.send(new DeleteConnectionCommand({ ConnectionName: connName }));
    return NextResponse.json({ success: true, message: "连接配置有效" });
  } catch (err: any) {
    // Clean up on failure
    try { await glue.send(new DeleteConnectionCommand({ ConnectionName: connName })); } catch {}
    return NextResponse.json({ success: false, message: err.message }, { status: 400 });
  }
}

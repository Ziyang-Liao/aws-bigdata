export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { MWAAClient, CreateWebLoginTokenCommand, GetEnvironmentCommand } from "@aws-sdk/client-mwaa";
import { apiOk, apiError } from "@/lib/api-response";

const mwaa = new MWAAClient({ region: process.env.AWS_REGION || "us-east-1" });
const ENV_NAME = process.env.MWAA_ENV_NAME || "bgp-mwaa";

export async function GET(req: NextRequest) {
  const dagId = req.nextUrl.searchParams.get("dagId") || "";

  try {
    const { WebToken, WebServerHostname } = await mwaa.send(
      new CreateWebLoginTokenCommand({ Name: ENV_NAME })
    );

    let loginUrl = `https://${WebServerHostname}/aws_mwaa/aws-console-sso?login=true#${WebToken}`;

    // If dagId specified, redirect to DAG detail page after login
    if (dagId) {
      loginUrl = `https://${WebServerHostname}/aws_mwaa/aws-console-sso?login=true#${WebToken}&next=/dags/${dagId}/grid`;
    }

    // Also get environment status
    const { Environment } = await mwaa.send(new GetEnvironmentCommand({ Name: ENV_NAME }));

    return apiOk({
      loginUrl,
      webServerHostname: WebServerHostname,
      status: Environment?.Status,
      airflowVersion: Environment?.AirflowVersion,
      environmentClass: Environment?.EnvironmentClass,
    });
  } catch (e: any) {
    return apiError(`MWAA 错误: ${e.message}`, 500);
  }
}

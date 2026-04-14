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

    // Build login URL with token as query parameter
    let path = dagId ? `/dags/${dagId}/grid` : "/home";
    const loginUrl = `https://${WebServerHostname}/aws_mwaa/aws-console-sso?login=true&token=${WebToken}`;

    // Get environment info
    const { Environment } = await mwaa.send(new GetEnvironmentCommand({ Name: ENV_NAME }));

    return apiOk({
      loginUrl,
      dagUrl: dagId ? `https://${WebServerHostname}/dags/${dagId}/grid` : null,
      webServerHostname: WebServerHostname,
      status: Environment?.Status,
      airflowVersion: Environment?.AirflowVersion,
      // AWS Console link as fallback
      consoleUrl: `https://${process.env.AWS_REGION || "us-east-1"}.console.aws.amazon.com/mwaa/home#/environments/${ENV_NAME}/sso`,
    });
  } catch (e: any) {
    return apiError(`MWAA 错误: ${e.message}`, 500);
  }
}

export const dynamic = "force-dynamic";
import { apiOk } from "@/lib/api-response";

export async function GET() {
  return apiOk({
    region: process.env.AWS_REGION || "us-east-1",
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "未配置",
    redshiftWorkgroup: process.env.REDSHIFT_WORKGROUP || "bgp-workgroup",
    glueScriptsBucket: process.env.GLUE_SCRIPTS_BUCKET || "未配置",
    glueRoleArn: process.env.GLUE_ROLE_ARN || "未配置",
    mwaaDagBucket: process.env.MWAA_DAG_BUCKET || "未配置",
    defaultVpcId: process.env.DEFAULT_VPC_ID || "未配置",
  });
}

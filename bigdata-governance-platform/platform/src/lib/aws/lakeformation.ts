import { LakeFormationClient } from "@aws-sdk/client-lakeformation";
export const lakeformation = new LakeFormationClient({ region: process.env.AWS_REGION || "us-east-1" });

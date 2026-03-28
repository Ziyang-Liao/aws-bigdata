import { GlueClient } from "@aws-sdk/client-glue";
export const glue = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

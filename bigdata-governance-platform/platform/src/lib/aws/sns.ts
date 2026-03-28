import { SNSClient } from "@aws-sdk/client-sns";
export const sns = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });

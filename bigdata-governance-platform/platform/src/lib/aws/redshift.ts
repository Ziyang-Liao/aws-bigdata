import { RedshiftDataClient } from "@aws-sdk/client-redshift-data";
export const redshiftData = new RedshiftDataClient({ region: process.env.AWS_REGION || "us-east-1" });

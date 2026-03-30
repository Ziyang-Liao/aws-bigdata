export const dynamic = "force-dynamic";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { apiOk, apiError } from "@/lib/api-response";

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET() {
  try {
    const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));
    return apiOk(Buckets.map((b) => ({ name: b.Name, createdAt: b.CreationDate?.toISOString() })));
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

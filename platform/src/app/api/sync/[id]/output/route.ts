export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

const USER_ID = "default-user";
const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Item: task } = await docClient.send(new GetCommand({ TableName: TABLES.SYNC_TASKS, Key: { userId: USER_ID, taskId: params.id } }));
    if (!task) return apiError("任务不存在", 404);

    const bucket = task.s3Config?.bucket;
    const prefix = task.s3Config?.prefix || "";
    if (!bucket) return apiOk([]);

    // List files for each source table
    const files: any[] = [];
    for (const table of task.sourceTables || []) {
      const tablePrefix = `${prefix}${table}/`;
      try {
        const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: tablePrefix, MaxKeys: 50 }));
        for (const obj of Contents) {
          files.push({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified?.toISOString(),
            table,
          });
        }
      } catch {}
    }

    return apiOk(files);
  } catch (e: any) {
    return apiError(e.message, 500);
  }
}

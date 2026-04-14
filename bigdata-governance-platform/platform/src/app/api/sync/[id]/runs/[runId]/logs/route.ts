export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk } from "@/lib/api-response";

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export async function GET(_: NextRequest, { params }: { params: { id: string; runId: string } }) {
  try {
    const { Item: run } = await docClient.send(new GetCommand({
      TableName: TABLES.TASK_RUNS, Key: { taskId: params.id, runId: params.runId },
    }));

    if (!run) return apiOk({ logs: ["运行记录不存在"], source: "none" });

    // Try S3 first
    if (run.logS3Key) {
      try {
        const bucket = process.env.GLUE_SCRIPTS_BUCKET || `bgp-glue-scripts-${process.env.AWS_ACCOUNT_ID}`;
        const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: run.logS3Key }));
        const text = await Body?.transformToString();
        if (text) {
          return apiOk({ logs: text.split("\n"), source: "s3", s3Key: run.logS3Key });
        }
      } catch {}
    }

    return apiOk({ logs: ["日志尚未生成，任务完成后将自动保存到 S3"], source: "pending", status: run.status });
  } catch (e: any) {
    return apiOk({ logs: [`日志加载失败: ${e.message}`], source: "error" });
  }
}

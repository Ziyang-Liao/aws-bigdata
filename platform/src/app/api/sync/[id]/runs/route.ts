export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";
import { apiOk, apiError } from "@/lib/api-response";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { Items = [] } = await docClient.send(new QueryCommand({
      TableName: TABLES.TASK_RUNS,
      KeyConditionExpression: "taskId = :tid",
      ExpressionAttributeValues: { ":tid": params.id },
      ScanIndexForward: false,
      Limit: 200,
    }));

    const runs = Items;
    const succeeded = runs.filter((r) => r.status === "succeeded").length;
    const stats = {
      total: runs.length,
      successRate: runs.length > 0 ? succeeded / runs.length : 0,
      avgDuration: runs.length > 0 ? runs.reduce((s, r) => s + (r.duration || 0), 0) / runs.length : 0,
      totalRows: runs.reduce((s, r) => s + (r.metrics?.rowsWritten || 0), 0),
    };

    return apiOk({ runs, stats });
  } catch (e: any) {
    return apiOk({ runs: [], stats: { total: 0, successRate: 0, avgDuration: 0, totalRows: 0 } });
  }
}

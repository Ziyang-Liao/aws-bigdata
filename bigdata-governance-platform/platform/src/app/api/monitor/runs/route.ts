export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const status = p.get("status") || "";
  const taskType = p.get("taskType") || "";
  const triggeredBy = p.get("triggeredBy") || "";
  const name = p.get("name") || "";
  const startDate = p.get("startDate") || "";
  const endDate = p.get("endDate") || "";
  const limit = Math.min(Number(p.get("limit") || 200), 500);

  try {
    // Build DynamoDB filter
    const filterParts: string[] = [];
    const attrNames: Record<string, string> = {};
    const attrValues: Record<string, any> = {};

    if (status) {
      filterParts.push("#st = :st");
      attrNames["#st"] = "status";
      attrValues[":st"] = status;
    }
    if (taskType) {
      filterParts.push("taskType = :tt");
      attrValues[":tt"] = taskType;
    }
    if (triggeredBy) {
      filterParts.push("triggeredBy = :tb");
      attrValues[":tb"] = triggeredBy;
    }

    const scanParams: any = { TableName: TABLES.TASK_RUNS, Limit: limit };
    if (filterParts.length > 0) {
      scanParams.FilterExpression = filterParts.join(" AND ");
      if (Object.keys(attrNames).length > 0) scanParams.ExpressionAttributeNames = attrNames;
      scanParams.ExpressionAttributeValues = attrValues;
    }

    const { Items: runs = [] } = await docClient.send(new ScanCommand(scanParams));

    // Fetch task names
    const [{ Items: syncTasks = [] }, { Items: workflows = [] }] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: TABLES.SYNC_TASKS, ProjectionExpression: "taskId, #n", ExpressionAttributeNames: { "#n": "name" } })),
      docClient.send(new ScanCommand({ TableName: TABLES.WORKFLOWS, ProjectionExpression: "workflowId, #n", ExpressionAttributeNames: { "#n": "name" } })),
    ]);
    const nameMap: Record<string, string> = {};
    for (const t of syncTasks) nameMap[t.taskId] = t.name;
    for (const w of workflows) nameMap[w.workflowId] = w.name;

    // Enrich and filter
    let enriched = runs.map((r: any) => ({
      taskId: r.taskId, runId: r.runId, status: r.status, duration: r.duration,
      error: r.error, finishedAt: r.finishedAt, airflowDagId: r.airflowDagId,
      taskName: nameMap[r.taskId] || r.taskId?.slice(-12),
      taskType: r.taskType || (syncTasks.some((t: any) => t.taskId === r.taskId) ? "sync" : "workflow"),
      triggeredBy: r.triggeredBy || (r.runId?.startsWith("scheduled") ? "schedule" : "manual"),
      startedAt: r.startedAt || r.finishedAt || null,
    }));

    // Name filter (post-query, since name is from join)
    if (name) {
      const q = name.toLowerCase();
      enriched = enriched.filter((r) => r.taskName?.toLowerCase().includes(q));
    }
    // Date range filter
    if (startDate) enriched = enriched.filter((r) => (r.startedAt || "") >= startDate);
    if (endDate) enriched = enriched.filter((r) => (r.startedAt || "") <= endDate + "T23:59:59");

    enriched.sort((a, b) => (b.startedAt || b.finishedAt || "").localeCompare(a.startedAt || a.finishedAt || ""));

    // Stats (from full enriched set)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayRuns = enriched.filter((r) => (r.startedAt || "") >= todayStart);
    const todaySuccess = todayRuns.filter((r) => r.status === "succeeded").length;
    const todayFailed = todayRuns.filter((r) => r.status === "failed").length;
    const durations = todayRuns.filter((r) => r.duration).map((r) => Number(r.duration));

    return NextResponse.json({
      runs: enriched,
      total: enriched.length,
      stats: {
        running: enriched.filter((r) => r.status === "running").length,
        todayTotal: todayRuns.length,
        todaySuccess,
        todayFailed,
        successRate: todayRuns.length > 0 ? Math.round((todaySuccess / todayRuns.length) * 100) : 0,
        avgDuration: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ runs: [], total: 0, stats: {}, error: e.message }, { status: 500 });
  }
}

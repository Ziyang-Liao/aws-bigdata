export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLES } from "@/lib/aws/dynamodb";

const USER_ID = "default-user";

export async function GET() {
  try {
    // Fetch all runs
    const { Items: runs = [] } = await docClient.send(new ScanCommand({ TableName: TABLES.TASK_RUNS }));

    // Fetch task names for join
    const [{ Items: syncTasks = [] }, { Items: workflows = [] }] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: TABLES.SYNC_TASKS, ProjectionExpression: "taskId, #n", ExpressionAttributeNames: { "#n": "name" } })),
      docClient.send(new ScanCommand({ TableName: TABLES.WORKFLOWS, ProjectionExpression: "workflowId, #n", ExpressionAttributeNames: { "#n": "name" } })),
    ]);

    const nameMap: Record<string, string> = {};
    for (const t of syncTasks) nameMap[t.taskId] = t.name;
    for (const w of workflows) nameMap[w.workflowId] = w.name;

    // Enrich runs with task name, sort by startedAt/finishedAt desc
    const enriched = runs.map((r: any) => ({
      taskId: r.taskId,
      runId: r.runId,
      status: r.status,
      duration: r.duration,
      error: r.error,
      finishedAt: r.finishedAt,
      airflowDagId: r.airflowDagId,
      taskName: nameMap[r.taskId] || r.taskId?.slice(-12),
      taskType: r.taskType || (syncTasks.some((t: any) => t.taskId === r.taskId) ? "sync" : "workflow"),
      triggeredBy: r.triggeredBy || (r.runId?.startsWith("scheduled") ? "schedule" : "manual"),
      startedAt: r.startedAt || r.finishedAt || null,
    }));

    enriched.sort((a, b) => {
      const ta = a.startedAt || a.finishedAt || "";
      const tb = b.startedAt || b.finishedAt || "";
      return tb.localeCompare(ta);
    });

    // Stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayRuns = enriched.filter((r) => (r.startedAt || r.finishedAt || "") >= todayStart);
    const todaySuccess = todayRuns.filter((r) => r.status === "succeeded").length;
    const todayFailed = todayRuns.filter((r) => r.status === "failed").length;
    const todayRunning = enriched.filter((r) => r.status === "running").length;
    const durations = todayRuns.filter((r) => r.duration).map((r) => Number(r.duration));
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    return NextResponse.json({
      runs: enriched,
      stats: {
        running: todayRunning,
        todayTotal: todayRuns.length,
        todaySuccess,
        todayFailed,
        successRate: todayRuns.length > 0 ? Math.round((todaySuccess / todayRuns.length) * 100) : 0,
        avgDuration,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ runs: [], stats: {}, error: e.message }, { status: 500 });
  }
}

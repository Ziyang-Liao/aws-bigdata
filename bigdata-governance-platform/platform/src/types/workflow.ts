export interface Workflow {
  userId: string;
  workflowId: string;
  name: string;
  description?: string;
  dagDefinition: { nodes: unknown[]; edges: unknown[] };
  airflowDagId?: string;
  cronExpression?: string;
  scheduleEnabled: boolean;
  status: "draft" | "active" | "paused" | "error";
  lastRunAt?: string;
  lastRunStatus?: string;
  createdAt: string;
  updatedAt: string;
}

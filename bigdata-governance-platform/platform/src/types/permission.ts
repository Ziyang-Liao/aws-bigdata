export interface Approval {
  approvalId: string;
  type: "datasource-online" | "sync-publish" | "sql-execute" | "permission-request";
  requesterId: string;
  approverId?: string;
  status: "pending" | "approved" | "rejected";
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  comment?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  userId: string;
  timestamp: string;
  action: "create" | "update" | "delete" | "execute" | "approve" | "reject";
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ip?: string;
}

export type Role = "Admin" | "Developer" | "Analyst" | "Viewer";

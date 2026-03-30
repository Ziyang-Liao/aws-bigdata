export interface DataSource {
  userId: string;
  datasourceId: string;
  name: string;
  type: "mysql" | "postgresql" | "oracle" | "sqlserver";
  host: string;
  port: number;
  database: string;
  username: string;
  status: "active" | "inactive" | "unreachable" | "error" | "testing";
  env?: string;
  tags?: string[];
  // Auto-provisioned resources
  secretArn?: string;
  glueConnectionName?: string;
  networkConfig?: {
    vpcId: string;
    subnetId: string;
    securityGroupId: string;
    isRds: boolean;
    rdsInstanceId?: string;
  };
  testResult?: {
    success: boolean;
    steps: { name: string; status: string; message: string; latencyMs?: number }[];
    totalMs: number;
    testedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type DataSourceFormValues = Omit<DataSource, "userId" | "datasourceId" | "status" | "secretArn" | "glueConnectionName" | "networkConfig" | "testResult" | "createdAt" | "updatedAt">;

export const DS_TYPE_OPTIONS = [
  { label: "MySQL", value: "mysql", defaultPort: 3306, icon: "🐬" },
  { label: "PostgreSQL", value: "postgresql", defaultPort: 5432, icon: "🐘" },
  { label: "Oracle", value: "oracle", defaultPort: 1521, icon: "🔶" },
  { label: "SQL Server", value: "sqlserver", defaultPort: 1433, icon: "🔷" },
] as const;

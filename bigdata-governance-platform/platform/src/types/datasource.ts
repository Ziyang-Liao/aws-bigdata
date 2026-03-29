export interface DataSource {
  userId: string;
  datasourceId: string;
  name: string;
  type: "mysql" | "postgresql" | "oracle" | "sqlserver";
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  status: "active" | "inactive" | "error";
  glueConnectionName?: string;
  createdAt: string;
  updatedAt: string;
}

export type DataSourceFormValues = Omit<DataSource, "userId" | "datasourceId" | "status" | "glueConnectionName" | "createdAt" | "updatedAt">;

export const DS_TYPE_OPTIONS = [
  { label: "MySQL", value: "mysql", defaultPort: 3306 },
  { label: "PostgreSQL", value: "postgresql", defaultPort: 5432 },
  { label: "Oracle", value: "oracle", defaultPort: 1521 },
  { label: "SQL Server", value: "sqlserver", defaultPort: 1433 },
] as const;

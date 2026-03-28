export interface DataSource {
  userId: string;
  datasourceId: string;
  name: string;
  type: "mysql" | "postgresql" | "oracle" | "sqlserver";
  host: string;
  port: number;
  database: string;
  username: string;
  credentialArn: string;
  status: "active" | "inactive" | "error";
  glueConnectionName?: string;
  createdAt: string;
  updatedAt: string;
}

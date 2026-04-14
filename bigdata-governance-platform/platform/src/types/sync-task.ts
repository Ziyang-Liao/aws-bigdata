export interface SyncTask {
  userId: string;
  taskId: string;
  name: string;
  datasourceId: string;
  sourceDatabase: string;
  sourceTables: string[];
  targetType: "s3-tables" | "redshift" | "both";
  s3Config?: {
    tableBucketArn: string;
    namespace: string;
    partitionFields: { field: string; type: string }[];
  };
  redshiftConfig?: {
    workgroupName: string;
    database: string;
    schema: string;
    sortKeys: string[];
    distKey: string;
    distStyle: "auto" | "key" | "even" | "all";
  };
  syncMode: "full" | "incremental";
  writeMode: "append" | "overwrite" | "merge";
  mergeKeys: string[];
  channel: "zero-etl" | "glue" | "dms";
  status: "draft" | "running" | "stopped" | "error";
  glueJobName?: string;
  integrationArn?: string;
  cronExpression?: string;
  createdAt: string;
  updatedAt: string;
}

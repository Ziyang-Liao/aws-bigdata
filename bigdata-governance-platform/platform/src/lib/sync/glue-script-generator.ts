import type { SyncTask } from "@/types/sync-task";
import type { DataSource } from "@/types/datasource";

const JDBC_URL: Record<string, (ds: DataSource) => string> = {
  mysql: (ds) => `jdbc:mysql://${ds.host}:${ds.port}/${ds.database}`,
  postgresql: (ds) => `jdbc:postgresql://${ds.host}:${ds.port}/${ds.database}`,
  oracle: (ds) => `jdbc:oracle:thin:@${ds.host}:${ds.port}:${ds.database}`,
  sqlserver: (ds) => `jdbc:sqlserver://${ds.host}:${ds.port};databaseName=${ds.database}`,
};

export function generateGlueScript(task: SyncTask, ds: DataSource): string {
  const jdbcUrl = JDBC_URL[ds.type]?.(ds) || "";
  const tables = task.sourceTables?.join('", "') || "";
  const partitions = task.s3Config?.partitionFields?.map((p) => `"${p.field}"`).join(", ") || "";

  const writeS3 = task.targetType === "s3-tables" || task.targetType === "both";
  const writeRedshift = task.targetType === "redshift" || task.targetType === "both";

  let script = `import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Source config
jdbc_url = "${jdbcUrl}"
tables = ["${tables}"]

for table_name in tables:
    # Read from source
    df = spark.read.format("jdbc").options(
        url=jdbc_url,
        dbtable=table_name,
        user="${ds.username}",
        password=args.get("SOURCE_PASSWORD", ""),
    ).load()

    print(f"Read {df.count()} rows from {table_name}")
`;

  if (writeS3) {
    const s3Path = task.s3Config?.tableBucketArn
      ? `s3://${task.s3Config.tableBucketArn.split(":::")[1] || "bgp-data"}/${task.s3Config.namespace || "default"}/{table_name}`
      : `s3://bgp-data-bucket/raw/{table_name}`;

    script += `
    # Write to S3 (Iceberg)
    df.write.format("iceberg")${partitions ? `.partitionBy(${partitions})` : ""} \\
        .mode("${task.writeMode === "overwrite" ? "overwrite" : "append"}") \\
        .save("${s3Path}")
`;
  }

  if (writeRedshift) {
    const rs = task.redshiftConfig;
    const schema = rs?.schema || "public";
    const mergeLogic = task.writeMode === "merge" && task.mergeKeys?.length
      ? `
    # Merge mode - use temp table + MERGE
    temp_table = f"stg_{table_name}"
    df.write.format("jdbc").options(
        url="jdbc:redshift://${rs?.workgroupName || "bgp-workgroup"}.region.redshift-serverless.amazonaws.com:5439/${rs?.database || "dev"}",
        dbtable=f"${schema}.{temp_table}",
    ).mode("overwrite").save()
`
      : `
    # Write to Redshift
    df.write.format("jdbc").options(
        url="jdbc:redshift://${rs?.workgroupName || "bgp-workgroup"}.region.redshift-serverless.amazonaws.com:5439/${rs?.database || "dev"}",
        dbtable=f"${schema}.{table_name}",
    ).mode("${task.writeMode === "overwrite" ? "overwrite" : "append"}").save()
`;
    script += mergeLogic;
  }

  script += `
job.commit()
`;

  return script;
}

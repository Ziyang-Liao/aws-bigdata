import type { SyncTask } from "@/types/sync-task";
import type { DataSource } from "@/types/datasource";

const JDBC_URL: Record<string, (ds: DataSource) => string> = {
  mysql: (ds) => `jdbc:mysql://${ds.host}:${ds.port}/${ds.database}`,
  postgresql: (ds) => `jdbc:postgresql://${ds.host}:${ds.port}/${ds.database}`,
  oracle: (ds) => `jdbc:oracle:thin:@${ds.host}:${ds.port}:${ds.database}`,
  sqlserver: (ds) => `jdbc:sqlserver://${ds.host}:${ds.port};databaseName=${ds.database}`,
};

export function generateGlueScript(task: any, ds: DataSource): string {
  const jdbcUrl = JDBC_URL[ds.type]?.(ds) || "";
  const tables = task.sourceTables || [];
  const writeS3 = task.targetType === "s3-tables" || task.targetType === "both";
  const writeRedshift = task.targetType === "redshift" || task.targetType === "both";
  const s3Bucket = task.s3Config?.bucket || "bgp-datalake-470377450205";
  const s3Prefix = task.s3Config?.prefix || "";
  const partitionFields = task.s3Config?.partitionFields || [];
  const writeMode = task.writeMode === "overwrite" ? "overwrite" : "append";

  return `import sys
import json
import boto3
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

# Get credentials from Secrets Manager
sm = boto3.client("secretsmanager", region_name="${process.env.AWS_REGION || "us-east-1"}")
secret = json.loads(sm.get_secret_value(SecretId="${ds.secretArn || ""}")["SecretString"])
db_user = secret["username"]
db_pass = secret["password"]

jdbc_url = "${jdbcUrl}"
tables = ${JSON.stringify(tables)}
results = {}

for table_name in tables:
    print(f"\\n{'='*50}")
    print(f"Syncing table: {table_name}")
    print(f"{'='*50}")

    # Read from source
    df = spark.read.format("jdbc").options(
        url=jdbc_url,
        dbtable=table_name,
        user=db_user,
        password=db_pass,
        driver="com.mysql.cj.jdbc.Driver",
    ).load()

    row_count = df.count()
    col_count = len(df.columns)
    print(f"Read {row_count} rows, {col_count} columns from {table_name}")
    print(f"Schema: {df.dtypes}")
${writeS3 ? `
    # Write to S3 as ${task.s3Config?.format || "parquet"}
    s3_path = "s3://${s3Bucket}/${s3Prefix}{table_name}/"
    writer = df.write.mode("${writeMode}")
${partitionFields.length > 0 ? `    # Partition by fields (skip if field not in schema)
    partition_cols = [c for c in [${partitionFields.map((p: any) => `"${p.field}"`).join(", ")}] if c in df.columns]
    if partition_cols:
        writer = writer.partitionBy(*partition_cols)
        print(f"Partitioned by: {partition_cols}")
    else:
        print(f"Partition fields not found in schema, writing without partitions")` : ""}
    writer.parquet(s3_path)
    print(f"Written to S3: {s3_path}")
    print(f"Format: parquet")
` : ""}${writeRedshift ? `
    # Write to Redshift
    rs_schema = "${task.redshiftConfig?.schema || "public"}"
    rs_table = f"{rs_schema}.{table_name}"
    print(f"Writing to Redshift: {rs_table}")
    # Using Glue native Redshift connector
    glueContext.write_dynamic_frame.from_options(
        frame=glueContext.create_dynamic_frame.from_rdd(df.rdd, "df"),
        connection_type="redshift",
        connection_options={
            "url": "jdbc:redshift://${task.redshiftConfig?.workgroupName || "bgp-workgroup"}.470377450205.us-east-1.redshift-serverless.amazonaws.com:5439/${task.redshiftConfig?.database || "dev"}",
            "dbtable": rs_table,
            "redshiftTmpDir": "s3://${s3Bucket}/tmp/redshift/",
        },
    )
    print(f"Written to Redshift: {rs_table}")
` : ""}
    results[table_name] = {"rows": row_count, "columns": col_count}
    print(f"Table {table_name} sync completed: {row_count} rows")

print(f"\\n{'='*50}")
print(f"SYNC RESULTS: {json.dumps(results)}")
print(f"Output location: s3://${s3Bucket}/${s3Prefix}")
print(f"{'='*50}")

job.commit()
`;
}

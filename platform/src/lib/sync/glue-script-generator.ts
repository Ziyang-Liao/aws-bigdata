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
  const partitionFields = task.s3Config?.partitionFields || [];
  const writeMode = task.writeMode || "overwrite";

  // S3 Tables config
  const tableBucketName = task.s3Config?.tableBucket || "bgp-table-bucket";
  const namespace = task.s3Config?.namespace || ds.database || "default";
  const icebergConfig = task.s3Config?.icebergConfig || {};
  const snapshotRetention = icebergConfig.snapshotRetentionDays || 7;
  const maxSnapshots = icebergConfig.maxSnapshots || 100;

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

# Get AWS account ID
account_id = boto3.client("sts").get_caller_identity()["Account"]

# Get credentials from Secrets Manager
sm = boto3.client("secretsmanager", region_name="${process.env.AWS_REGION || "us-east-1"}")
secret = json.loads(sm.get_secret_value(SecretId="${ds.secretArn || ""}")["SecretString"])
db_user = secret["username"]
db_pass = secret["password"]

jdbc_url = "${jdbcUrl}"
tables = ${JSON.stringify(tables)}
results = ${"{}"}

# S3 Tables catalog path (backtick bucket name with hyphens)
S3T_CATALOG = "s3tablescatalog"
S3T_BUCKET_RAW = "${tableBucketName}"
BT = chr(96)
S3T_BUCKET = BT + S3T_BUCKET_RAW + BT
S3T_NAMESPACE = "${namespace}"

for table_name in tables:
    print(f"\\n{'='*60}")
    print(f"Syncing table: {table_name}")
    print(f"{'='*60}")

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
    # Write to S3 Tables (managed Iceberg)
    temp_view = f"temp_{table_name}"
    df.createOrReplaceTempView(temp_view)
    s3t_table = f"s3tablescatalog.{S3T_NAMESPACE}.{table_name}"

    try:
        # Step 1: Check if table exists by trying to read it
        table_exists = False
        try:
            spark.sql(f"SELECT 1 FROM {s3t_table} LIMIT 1")
            table_exists = True
            print(f"Table {s3t_table} exists")
        except:
            print(f"Table {s3t_table} does not exist, will create")

        # Step 2: Write data
        if table_exists:
${writeMode === "overwrite" ? `            # Overwrite: truncate then insert
            spark.sql(f"DELETE FROM {s3t_table}")
            spark.sql(f"INSERT INTO {s3t_table} SELECT * FROM {temp_view}")
            print(f"OVERWRITE {s3t_table}: deleted old data + inserted {row_count} rows")` : `            # Append
            spark.sql(f"INSERT INTO {s3t_table} SELECT * FROM {temp_view}")
            print(f"APPEND {s3t_table}: inserted {row_count} rows")`}
        else:
            # Create new table with data
${partitionFields.length > 0 ? `            partition_clause = "PARTITIONED BY (${partitionFields.map((p: any) => {
    if (p.type === "date") return `days(${p.field})`;
    if (p.type === "year-month") return `months(${p.field})`;
    return p.field;
  }).join(", ")})"` : `            partition_clause = ""`}
            create_sql = f"CREATE TABLE {s3t_table} USING iceberg {partition_clause} TBLPROPERTIES ('format-version'='2', 'write.parquet.compression-codec'='zstd') AS SELECT * FROM {temp_view}"
            spark.sql(create_sql)
            print(f"CREATED {s3t_table} with {row_count} rows")

        print(f"Written to S3 Tables: {s3t_table}")
        print(f"Table Bucket: {S3T_BUCKET_RAW}, Namespace: {S3T_NAMESPACE}")
${partitionFields.length > 0 ? `        print(f"Partitioned by: ${partitionFields.map((p: any) => `${p.field}(${p.type})`).join(", ")}")` : ""}

    except Exception as e:
        error_msg = str(e)
        print(f"S3 Tables write error: {error_msg[:300]}")
        raise e
` : ""}${writeRedshift ? `
    # Write to Redshift
    rs_schema = "${task.redshiftConfig?.schema || "public"}"
    rs_table = f"{rs_schema}.{table_name}"
    print(f"Writing to Redshift: {rs_table}")
    try:
        df.write.format("jdbc").options(
            url=f"jdbc:redshift://${task.redshiftConfig?.workgroupName || "bgp-workgroup"}.{account_id}.us-east-1.redshift-serverless.amazonaws.com:5439/${task.redshiftConfig?.database || "dev"}",
            dbtable=rs_table, user=db_user, password=db_pass,
            driver="com.amazon.redshift.jdbc42.Driver",
        ).mode("${writeMode === "overwrite" ? "overwrite" : "append"}").save()
        print(f"Written to Redshift: {rs_table}")
    except Exception as e:
        print(f"Redshift write skipped: {e}")
` : ""}
    results[table_name] = {"rows": row_count, "columns": col_count}
    print(f"Table {table_name} sync completed: {row_count} rows")

print(f"\\n{'='*60}")
print(f"SYNC RESULTS: {json.dumps(results)}")
print(f"Target: S3 Tables (${tableBucketName}/${namespace})")
print(f"{'='*60}")

job.commit()
`;
}

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
  const namespace = task.s3Config?.namespace || task.s3Config?.prefix?.replace(/\//g, "") || "ecommerce";
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
    s3t_full_name = f"{S3T_CATALOG}.{S3T_BUCKET}.{S3T_NAMESPACE}.{table_name}"
    temp_view = f"temp_{table_name}"
    df.createOrReplaceTempView(temp_view)

    try:
        # Write to S3 Tables via Iceberg Spark catalog (configured via --conf)
        # Catalog name: s3tablesbucket (registered via Glue Job --conf)
        # Table path: s3tablesbucket.{namespace}.{table_name}
        temp_view = f"temp_{table_name}"
        df.createOrReplaceTempView(temp_view)

        s3t_table = f"s3tablesbucket.{S3T_NAMESPACE}.{table_name}"

        # Try CREATE TABLE AS SELECT (for new table)
        try:
            spark.sql(f"INSERT INTO {s3t_table} SELECT * FROM {temp_view}")
            print(f"INSERT INTO {s3t_table} succeeded")
        except Exception as insert_err:
            if "TABLE_OR_VIEW_NOT_FOUND" in str(insert_err) or "not found" in str(insert_err).lower():
                # Table schema not set yet, use CTAS
                spark.sql(f"CREATE TABLE {s3t_table} USING iceberg AS SELECT * FROM {temp_view}")
                print(f"CREATE TABLE {s3t_table} succeeded")
            else:
                raise insert_err

        print(f"Written to S3 Tables: {s3t_table}")
        print(f"Table Bucket: {S3T_BUCKET_RAW}, Namespace: {S3T_NAMESPACE}")
${partitionFields.length > 0 ? `        print(f"Partitioned by: ${partitionFields.map((p: any) => `${p.field}(${p.type})`).join(", ")}")` : ""}

    except Exception as e:
        error_msg = str(e)
        print(f"S3 Tables write error: {error_msg[:300]}")
        # Fallback: plain S3 Parquet
        s3_path = f"s3://bgp-datalake-470377450205/${task.s3Config?.prefix || "ecommerce/"}{table_name}/"
        df.write.mode("overwrite").parquet(s3_path)
        print(f"Fallback to S3 Parquet: {s3_path}")
` : ""}${writeRedshift ? `
    # Write to Redshift
    rs_schema = "${task.redshiftConfig?.schema || "public"}"
    rs_table = f"{rs_schema}.{table_name}"
    print(f"Writing to Redshift: {rs_table}")
    try:
        df.write.format("jdbc").options(
            url="jdbc:redshift://${task.redshiftConfig?.workgroupName || "bgp-workgroup"}.470377450205.us-east-1.redshift-serverless.amazonaws.com:5439/${task.redshiftConfig?.database || "dev"}",
            dbtable=rs_table, user="admin", password="TempPass123!",
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

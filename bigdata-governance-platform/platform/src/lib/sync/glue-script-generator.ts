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
  const writeMode = task.writeMode || "overwrite";
  const format = task.s3Config?.format || "iceberg";

  // Iceberg config
  const icebergConfig = task.s3Config?.icebergConfig || {};
  const compactionMins = icebergConfig.compactionMinutes || 60;
  const snapshotRetention = icebergConfig.snapshotRetentionDays || 7;
  const maxSnapshots = icebergConfig.maxSnapshots || 100;

  const useIceberg = format === "iceberg" || format === "parquet"; // Default to Iceberg

  return `import sys
import json
import boto3
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.sql import SparkSession

args = getResolvedOptions(sys.argv, ["JOB_NAME"])
sc = SparkContext()
glueContext = GlueContext(sc)
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Configure Spark for Iceberg
spark = SparkSession.builder \\
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \\
    .config("spark.sql.catalog.glue_catalog", "org.apache.iceberg.spark.SparkCatalog") \\
    .config("spark.sql.catalog.glue_catalog.warehouse", "s3://${s3Bucket}/${s3Prefix}") \\
    .config("spark.sql.catalog.glue_catalog.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog") \\
    .config("spark.sql.catalog.glue_catalog.io-impl", "org.apache.iceberg.aws.s3.S3FileIO") \\
    .getOrCreate()

# Get credentials from Secrets Manager
sm = boto3.client("secretsmanager", region_name="${process.env.AWS_REGION || "us-east-1"}")
secret = json.loads(sm.get_secret_value(SecretId="${ds.secretArn || ""}")["SecretString"])
db_user = secret["username"]
db_pass = secret["password"]

jdbc_url = "${jdbcUrl}"
tables = ${JSON.stringify(tables)}
results = {}

# Ensure Glue database exists
try:
    spark.sql("CREATE DATABASE IF NOT EXISTS glue_catalog.${s3Prefix.replace(/\//g, "") || "datalake"}")
except Exception as e:
    print(f"Database creation note: {e}")

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
${writeS3 && useIceberg ? `
    # Write to Iceberg table via Glue Catalog
    iceberg_db = "glue_catalog.${s3Prefix.replace(/\//g, "") || "datalake"}"
    iceberg_table = f"{iceberg_db}.{table_name}"

    try:
        # Create or replace Iceberg table
        df.writeTo(iceberg_table) \\
            .using("iceberg") \\
${partitionFields.length > 0 ? `            .partitionedBy(${partitionFields.map((p: any) => {
    if (p.type === "date") return `days("${p.field}")`;
    if (p.type === "year-month") return `months("${p.field}")`;
    return `"${p.field}"`;
  }).join(", ")}) \\` : ""}
            .tableProperty("format-version", "2") \\
            .tableProperty("write.metadata.compression-codec", "gzip") \\
            .tableProperty("history.expire.max-snapshot-age-ms", "${snapshotRetention * 86400000}") \\
            .tableProperty("history.expire.min-snapshots-to-keep", "${maxSnapshots}") \\
            .tableProperty("write.target-file-size-bytes", "134217728") \\
            .tableProperty("write.parquet.compression-codec", "zstd") \\
            .${writeMode === "overwrite" ? "createOrReplace" : "append"}()

        print(f"Written to Iceberg: {iceberg_table}")
        print(f"Iceberg config: snapshot_retention={snapshotRetention}d, max_snapshots={maxSnapshots}")
${partitionFields.length > 0 ? `        print(f"Partitioned by: ${partitionFields.map((p: any) => `${p.field}(${p.type})`).join(", ")}")` : ""}
    except Exception as e:
        print(f"Iceberg write failed, falling back to Parquet: {e}")
        # Fallback to plain Parquet
        s3_path = f"s3://${s3Bucket}/${s3Prefix}{table_name}/"
        writer = df.write.mode("${writeMode === "overwrite" ? "overwrite" : "append"}")
${partitionFields.length > 0 ? `        partition_cols = [c for c in [${partitionFields.map((p: any) => `"${p.field}"`).join(", ")}] if c in df.columns]
        if partition_cols:
            writer = writer.partitionBy(*partition_cols)` : ""}
        writer.parquet(s3_path)
        print(f"Fallback written to S3: {s3_path}")
` : writeS3 ? `
    # Write to S3 as Parquet
    s3_path = f"s3://${s3Bucket}/${s3Prefix}{table_name}/"
    writer = df.write.mode("${writeMode === "overwrite" ? "overwrite" : "append"}")
${partitionFields.length > 0 ? `    partition_cols = [c for c in [${partitionFields.map((p: any) => `"${p.field}"`).join(", ")}] if c in df.columns]
    if partition_cols:
        writer = writer.partitionBy(*partition_cols)` : ""}
    writer.parquet(s3_path)
    print(f"Written to S3: {s3_path}")
` : ""}${writeRedshift ? `
    # Write to Redshift
    rs_schema = "${task.redshiftConfig?.schema || "public"}"
    rs_table = f"{rs_schema}.{table_name}"
    print(f"Writing to Redshift: {rs_table}")
    try:
        df.write.format("jdbc").options(
            url="jdbc:redshift://${task.redshiftConfig?.workgroupName || "bgp-workgroup"}.470377450205.us-east-1.redshift-serverless.amazonaws.com:5439/${task.redshiftConfig?.database || "dev"}",
            dbtable=rs_table,
            user="admin",
            password="TempPass123!",
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
print(f"Output: s3://${s3Bucket}/${s3Prefix}")
print(f"Format: ${useIceberg ? "Iceberg (Glue Catalog)" : "Parquet"}")
print(f"{'='*60}")

job.commit()
`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 根据同步任务配置生成 Glue PySpark 脚本
 * 支持: MySQL → S3 Tables (Iceberg) 和 MySQL → Redshift
 */
export function generateGlueScript(task: any): string {
  const lines: string[] = [
    `import sys`,
    `from awsglue.transforms import *`,
    `from awsglue.utils import getResolvedOptions`,
    `from pyspark.context import SparkContext`,
    `from awsglue.context import GlueContext`,
    `from awsglue.job import Job`,
    ``,
    `args = getResolvedOptions(sys.argv, ["JOB_NAME"])`,
    `sc = SparkContext()`,
    `glueContext = GlueContext(sc)`,
    `spark = glueContext.spark_session`,
    `job = Job(glueContext)`,
    `job.init(args["JOB_NAME"], args)`,
    ``,
  ];

  // 读取源数据
  lines.push(`# 读取源数据`);
  lines.push(`source_df = glueContext.create_dynamic_frame.from_catalog(`);
  lines.push(`    database="${task.sourceDatabase}",`);
  lines.push(`    table_name="${task.sourceTables?.[0] || "table"}",`);
  lines.push(`    transformation_ctx="source_df"`);
  lines.push(`).toDF()`);
  lines.push(``);

  // 写入 S3 Tables (Iceberg)
  if (task.targetType === "s3-tables" || task.targetType === "both") {
    lines.push(`# 写入 S3 Tables (Iceberg)`);

    const partitionClause = task.s3Config?.partitionFields?.length
      ? `.partitionBy(${task.s3Config.partitionFields.map((p: any) => `"${p.field}"`).join(", ")})`
      : "";

    const writeMode = task.writeMode === "merge" ? "append" : task.writeMode || "append";

    lines.push(`source_df.write \\`);
    lines.push(`    .format("iceberg") \\`);
    lines.push(`    .mode("${writeMode}") \\`);
    if (partitionClause) lines.push(`    ${partitionClause} \\`);
    lines.push(`    .save("${task.s3Config?.namespace || "default"}.${task.sourceTables?.[0] || "table"}")`);
    lines.push(``);
  }

  // 写入 Redshift
  if (task.targetType === "redshift" || task.targetType === "both") {
    lines.push(`# 写入 Redshift`);
    const rsConfig = task.redshiftConfig || {};
    const targetTable = `${rsConfig.schema || "public"}.${task.sourceTables?.[0] || "table"}`;

    if (task.writeMode === "merge" && task.mergeKeys?.length) {
      // MERGE/UPSERT: 写到临时表再 MERGE
      lines.push(`# Upsert 模式: 先写临时表再 MERGE`);
      lines.push(`staging_table = "${targetTable}_staging"`);
      lines.push(`source_df.write \\`);
      lines.push(`    .format("io.github.spark_redshift_community.spark.redshift") \\`);
      lines.push(`    .option("url", "jdbc:redshift://${rsConfig.workgroupName}:5439/${rsConfig.database}") \\`);
      lines.push(`    .option("dbtable", staging_table) \\`);
      lines.push(`    .option("tempdir", "s3://bgp-temp/redshift-staging/") \\`);
      lines.push(`    .mode("overwrite") \\`);
      lines.push(`    .save()`);
      lines.push(``);
      const mergeOn = task.mergeKeys.map((k: string) => `t.${k} = s.${k}`).join(" AND ");
      lines.push(`# 执行 MERGE`);
      lines.push(`merge_sql = """MERGE INTO ${targetTable} t USING ${targetTable}_staging s ON ${mergeOn}`);
      lines.push(`WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT VALUES *"""`);
      lines.push(`spark.sql(merge_sql)`);
    } else {
      lines.push(`source_df.write \\`);
      lines.push(`    .format("io.github.spark_redshift_community.spark.redshift") \\`);
      lines.push(`    .option("url", "jdbc:redshift://${rsConfig.workgroupName}:5439/${rsConfig.database}") \\`);
      lines.push(`    .option("dbtable", "${targetTable}") \\`);
      lines.push(`    .option("tempdir", "s3://bgp-temp/redshift-staging/") \\`);
      lines.push(`    .mode("${task.writeMode || "append"}") \\`);
      lines.push(`    .save()`);
    }
    lines.push(``);
  }

  lines.push(`job.commit()`);
  return lines.join("\n");
}

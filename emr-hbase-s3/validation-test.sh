#!/bin/bash
# HBase on S3 读写验证脚本
# 在 EMR 集群上通过 Step 执行

CLUSTER_ID="<CLUSTER_ID>"
REGION="us-east-1"

# 写入测试
cat > /tmp/hbase_write_test.json << 'EOF'
[{
  "Name": "HBase-S3-Write-Test",
  "ActionOnFailure": "CONTINUE",
  "Type": "CUSTOM_JAR",
  "Jar": "command-runner.jar",
  "Args": ["bash", "-c", "echo -e \"create 'test_s3_validation', 'cf'\\nput 'test_s3_validation', 'row1', 'cf:col1', 'hello_s3'\\nput 'test_s3_validation', 'row2', 'cf:col1', 'hbase_on_s3_works'\\nflush 'test_s3_validation'\\nexit\" | hbase shell 2>&1"]
}]
EOF

aws emr add-steps --cluster-id "$CLUSTER_ID" --region "$REGION" \
  --steps file:///tmp/hbase_write_test.json

# 读取测试（将输出写到 S3）
cat > /tmp/hbase_read_test.json << 'EOF'
[{
  "Name": "HBase-S3-Read-Test",
  "ActionOnFailure": "CONTINUE",
  "Type": "CUSTOM_JAR",
  "Jar": "command-runner.jar",
  "Args": ["bash", "-c", "echo -e \"scan 'test_s3_validation'\\nget 'test_s3_validation', 'row1'\\nget 'test_s3_validation', 'row2'\\ncount 'test_s3_validation'\\nlist\\nexit\" | hbase shell 2>&1 | aws s3 cp - s3://<BUCKET_NAME>/validation-output/read_test.log"]
}]
EOF

aws emr add-steps --cluster-id "$CLUSTER_ID" --region "$REGION" \
  --steps file:///tmp/hbase_read_test.json

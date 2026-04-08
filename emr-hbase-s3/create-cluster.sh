#!/bin/bash
# EMR HBase on S3 集群创建脚本（脱敏版）
# 使用前请替换 <> 中的占位符为实际值

aws emr create-cluster \
  --name "HBase-S3-Recovery" \
  --release-label emr-7.12.0 \
  --applications Name=HBase Name=Hadoop Name=ZooKeeper \
  --ec2-attributes '{
    "SubnetId": "<PRIVATE_SUBNET_ID>",
    "InstanceProfile": "EMR_EC2_DefaultRole",
    "EmrManagedMasterSecurityGroup": "<MASTER_SG_ID>",
    "EmrManagedSlaveSecurityGroup": "<SLAVE_SG_ID>",
    "ServiceAccessSecurityGroup": "<SERVICE_ACCESS_SG_ID>"
  }' \
  --instance-groups '[
    {"Name":"Master","InstanceGroupType":"MASTER","InstanceType":"m5.2xlarge","InstanceCount":1},
    {"Name":"Core","InstanceGroupType":"CORE","InstanceType":"m5.2xlarge","InstanceCount":3}
  ]' \
  --configurations '[
    {
      "Classification": "hbase",
      "Properties": {
        "hbase.emr.storageMode": "s3",
        "hbase.emr.readreplica.enabled": "false"
      }
    },
    {
      "Classification": "hbase-site",
      "Properties": {
        "hbase.rootdir": "s3://<BUCKET_NAME>/hbase/data",
        "hbase.regionserver.handler.count": "100"
      }
    },
    {
      "Classification": "emrfs-site",
      "Properties": {
        "fs.s3.maxConnections": "500"
      }
    }
  ]' \
  --service-role EMR_DefaultRole \
  --log-uri "s3://<BUCKET_NAME>/emr-logs/" \
  --visible-to-all-users \
  --auto-termination-policy '{"IdleTimeout":7200}' \
  --unhealthy-node-replacement \
  --region us-east-1

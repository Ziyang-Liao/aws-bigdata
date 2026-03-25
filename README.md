# AWS 大数据实战指南

[![AWS](https://img.shields.io/badge/AWS-BigData-orange.svg)](https://aws.amazon.com/big-data/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AWS 大数据服务的操作配置与实战指南合集，涵盖 ETL 管道、流式数据入湖、数据仓库等场景。

## 目录结构

```
aws-bigdata/
├── etl/                                        # ETL 管道与数据入湖
│   ├── README.md                               # ETL Workshop 详细说明
│   ├── glue_init_mysql.py                      # Glue Python Shell: 初始化 MySQL 测试数据
│   ├── glue_add_city_column.py                 # Glue Python Shell: 添加 city 列并填充数据
│   ├── glue_add_duplicates.py                  # Glue Python Shell: 插入重复/更新记录用于去重测试
│   ├── glue_incremental_test.py                # Glue Python Shell: 插入增量数据用于测试
│   ├── glue_mysql_to_iceberg.py                # Glue 5.0 ETL: MySQL → Iceberg (增量 MERGE + PII 脱敏)
│   ├── glue_mysql_to_iceberg_partitioned.py    # Glue 5.0 ETL: MySQL → Iceberg 分区表 (按 city 分区)
│   ├── glue_mysql_to_s3tables.py               # Glue 5.0 ETL: MySQL → S3 Tables (托管 Iceberg)
│   └── verify_workshop.sh                      # ETL Workshop 端到端验证脚本
└── s3table/                                    # S3 Tables 相关方案与指南
    ├── MSK-Serverless-to-S3Tables-Guide.md     # MSK → S3 Tables 实战操作指南
    └── S3_TABLES_WIP.md                        # S3 Tables 方案调研笔记
```

## 内容概览

### ETL 管道 (`etl/`)

包含两套完整的数据入湖方案：

**方案一：Glue ETL 批处理入湖**

完整的增量 ETL 管道，覆盖从数据源到数据仓库的全链路：

```
RDS MySQL → Glue ETL (增量抽取 + PII 脱敏 + MERGE 去重) → S3 Iceberg 表 → Redshift
```

- 支持 Iceberg 标准 S3 存储和 S3 Tables 托管存储两种模式
- 增量抽取基于 Glue Job Bookmark
- MERGE INTO 实现 Upsert 去重
- PII 字段自动脱敏（手机号、邮箱）
- 支持按 city 字段分区

**方案二：MSK Serverless 流式入湖**

实时流式数据入湖方案，全部署在私有子网：

```
数据源 → MSK Serverless (IAM 认证) → MSK Connect (Iceberg Sink) → S3 Tables
```

- MSK Serverless + MSK Connect 全托管架构
- Iceberg Kafka Connect 1.7.1 写入 S3 Tables REST Catalog
- 自动建表、Schema Evolution
- 详细的踩坑记录（7 个常见问题及解决方案）

## 后续规划

| 方向 | 内容 |
|------|------|
| `emr/` | EMR Serverless / EMR on EKS 数据处理 |
| `redshift/` | Redshift Serverless 数据仓库配置与优化 |
| `kinesis/` | Kinesis Data Streams / Firehose 实时流处理 |
| `athena/` | Athena 查询优化与 Iceberg 表管理 |
| `lake-formation/` | Lake Formation 数据湖权限管理 |

## License

MIT

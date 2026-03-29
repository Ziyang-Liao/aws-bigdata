# AWS 大数据实战指南

[![AWS](https://img.shields.io/badge/AWS-BigData-orange.svg)](https://aws.amazon.com/big-data/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AWS 大数据服务的操作配置与实战指南合集，涵盖 ETL 管道、流式数据入湖、数据仓库、点击流分析等场景。

## 目录结构

```
aws-bigdata/
├── clickstream-lakehouse/          # Clickstream Analytics 增强版 (v1.2.1)
├── etl/                            # Glue ETL 管道与数据入湖
├── s3table/                        # S3 Tables + MSK 流式入湖
├── Flink/                          # Flink 问题排查与调优
├── bigdata-governance-platform/    # 大数据治理平台
└── strands-agent-demo/             # Strands Agent 智能体 Demo
```

## 项目概览

### Clickstream Analytics 增强版 (`clickstream-lakehouse/`)

基于 [aws-solutions/clickstream-analytics-on-aws](https://github.com/aws-solutions/clickstream-analytics-on-aws) 的增强版本，新增 S3 Tables 数据建模、字段过滤、跨区域同步等功能。

```
数据采集 → Ingestion Server (ECS) → S3 Buffer → EMR Spark ETL → S3 Tables (Iceberg)
                                                              → Athena 查询
                                                              → Redshift 数仓
```

- **S3 Tables 数据建模**：EMR Serverless + Apache Iceberg，15 个 Spark 建模 Job
- **字段收集过滤**：Web 控制台配置白名单/黑名单
- **一键部署**：`./deployment/solution-deploy.sh` 自动完成构建、镜像推送、模板上传、CloudFormation 部署

详见 [clickstream-lakehouse/README.md](clickstream-lakehouse/README.md)

### ETL 管道 (`etl/`)

Glue ETL 批处理入湖方案：

```
RDS MySQL → Glue ETL (增量抽取 + PII 脱敏 + MERGE 去重) → S3 Iceberg 表 → Redshift
```

- 支持 Iceberg 标准 S3 存储和 S3 Tables 托管存储
- 增量抽取基于 Glue Job Bookmark
- PII 字段自动脱敏（手机号、邮箱）

### S3 Tables 流式入湖 (`s3table/`)

MSK Serverless 实时流式数据入湖方案：

```
数据源 → MSK Serverless (IAM 认证) → MSK Connect (Iceberg Sink) → S3 Tables
```

- 全托管架构，部署在私有子网
- 详细的踩坑记录（7 个常见问题及解决方案）

### Flink 问题排查 (`Flink/`)

Apache Flink idle timeout 相关 bug 分析与排查记录。

### 大数据治理平台 (`bigdata-governance-platform/`)

大数据治理平台的架构设计与开发日志。

## 快速开始

### Clickstream Analytics 部署

```bash
cd clickstream-lakehouse/deployment
./solution-deploy.sh -r <region> -p <aws-profile> -e <email>
```

### ETL Workshop

```bash
cd etl
# 按 README.md 中的步骤操作
```

## 版本管理

各子项目独立维护版本号，详见各自的 CHANGELOG：

| 项目 | 当前版本 | 变更日志 |
|------|---------|---------|
| clickstream-lakehouse | v1.2.1 (stable) / v1.3.0-dev | [CHANGELOG](clickstream-lakehouse/CHANGELOG.md) |

## 贡献指南

欢迎提交 Issue 和 Pull Request。请参阅 [CONTRIBUTING](clickstream-lakehouse/CONTRIBUTING.md) 了解详情。

## License

[MIT](LICENSE)

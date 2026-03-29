# BigData Governance Platform / 大数据开发治理平台

一站式大数据开发治理平台，通过可视化配置实现数据同步、ETL 编排、任务调度、数据治理。底层全部基于 AWS 托管服务，平台本身只做 UI 层 + API 编排层。

## 架构总览

```
                         ┌─────────────────────────┐
                         │     CloudFront (CDN)     │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │   Platform (ECS Fargate) │
                         │   Next.js Full-Stack App │
                         └────────────┬────────────┘
                                      │
          ┌───────────┬───────────┬───┴────┬──────────┬──────────┐
          ▼           ▼           ▼        ▼          ▼          ▼
       Cognito    DynamoDB     MWAA    Glue API   Redshift   OpenMetadata
      (Auth)    (Metadata)  (Schedule) (ETL)    (Data API)  (ECS Fargate)
```

## 核心功能模块

| 模块 | 功能 | 底层服务 |
|------|------|---------|
| 数据源管理 | 配置/测试数据库连接 | DMS / Glue Connection API |
| 数据同步 | MySQL → S3 Tables (Iceberg) → Redshift | Zero-ETL / DMS / Glue Job |
| ETL 编排 | DAG 拖拉拽可视化编排 | MWAA (Airflow) |
| 任务调度 | Cron / 事件触发 / 依赖调度 | MWAA + EventBridge |
| Redshift 任务 | SQL 编辑执行、排序键/分布键配置 | Redshift Data API |
| 任务监控 | 运行状态、日志、告警 | CloudWatch + Glue/Airflow API |
| 数据治理 | 血缘(列级)、数据目录、数据地图、数据质量 | OpenMetadata |
| 用户管理 | 认证、RBAC 权限 | Cognito |

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Next.js 14 (App Router) | 全栈一体 |
| UI 组件 | Ant Design 5 | 企业级后台 |
| DAG 编辑器 | ReactFlow | 拖拉拽流程编排 |
| SQL 编辑器 | Monaco Editor | VS Code 同款 |
| 后端 API | Next.js API Routes + boto3 (Lambda) | AWS SDK 调用 |
| 元数据存储 | DynamoDB | 任务/数据源/调度配置 |
| 用户认证 | Amazon Cognito | 免自建用户系统 |
| 数据治理 | OpenMetadata (ECS Fargate) | 血缘/目录/质量 |
| 部署 | ECS Fargate + CloudFront | 容器化部署 |
| IaC | CDK (TypeScript) | 基础设施即代码 |

## 数据流架构

```
源数据库
  │
  ├── 通道 1：Zero-ETL（支持的源优先走这条）
  │     自建 MySQL / RDS MySQL / Aurora / PG / Oracle
  │     → 直接到 Redshift（近实时，零运维）
  │
  └── 通道 2：Glue ETL（通道1覆盖不了的走这条）
        任意 JDBC 源
        → S3 Tables (Iceberg, 可配分区)
        → Redshift (MERGE/COPY, 可配排序键/分布键)

调度：MWAA (Airflow) 统一调度
监控：CloudWatch + 平台聚合展示
治理：OpenMetadata 自动采集血缘
```

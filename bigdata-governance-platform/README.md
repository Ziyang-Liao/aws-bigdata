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
    ┌──────────┬──────────┬───────┬────────┼────────┬───────────┬──────────────┐
    ▼          ▼          ▼       ▼        ▼        ▼           ▼              ▼
 Cognito   DynamoDB    MWAA   Glue API  Redshift  Lake        OpenMetadata   SNS
 (Auth     (Metadata   (调度)  (ETL)    (Data     Formation   (ECS Fargate   (告警
  +RBAC)   +审批+审计)          +DMS     API)     (字段级      血缘/目录      通知)
                               +Zero-ETL          权限控制)    /质量)
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
| 权限管控 | 字段级数据权限、角色管理 | Lake Formation + Cognito Groups |
| 审批流 | 数据源上线/任务发布/SQL执行/权限申请审批 | DynamoDB + SNS |
| 操作审计 | 全操作记录、查询、导出 | DynamoDB |

## 权限管控体系

```
平台层（RBAC）
├── Admin       - 全部权限 + 用户管理 + 审批
├── Developer   - 创建/编辑任务，生产发布需审批
├── Analyst     - 只读查询 + 数据目录浏览
└── Viewer      - 只读监控大盘

数据层（字段级，Lake Formation）
├── 库级别     - 授权可访问的数据库
├── 表级别     - 授权可访问的表
├── 列级别     - 授权可访问的字段（敏感字段过滤）
└── 敏感脱敏   - Lake Formation Tag + 列掩码

流程层（审批）
├── 数据源上线       → Admin 审批
├── 同步任务发布生产  → Admin 审批
├── 生产 SQL 执行    → Admin 审批
└── 数据权限申请     → 数据 Owner 审批

审计层
└── 全操作记录（谁/何时/做了什么）→ DynamoDB + 可导出
```

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
| 数据权限 | AWS Lake Formation | 库/表/列级权限控制 |
| 数据治理 | OpenMetadata (ECS Fargate) | 血缘/目录/质量 |
| 告警通知 | Amazon SNS | 邮件/钉钉/企业微信 Webhook |
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
权限：Lake Formation 统一管控（库/表/列级），Redshift + S3 Tables 自动继承
审批：数据源上线 / 任务发布 / SQL 执行 / 权限申请 → 审批通过后执行
审计：全操作记录写入 DynamoDB，可查询可导出
```

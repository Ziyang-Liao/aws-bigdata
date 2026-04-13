# 项目实施计划 / Implementation Roadmap

## 当前状态：Phase 5 - 数据治理集成 🚧 进行中

---

## Phase 0: 项目初始化（第 0 周） ✅
- [x] 确定架构方案
- [x] 确定技术栈
- [x] 创建项目仓库
- [x] 创建 GitHub 仓库并推送
- [x] 初始化 Next.js 项目脚手架
- [x] 定义 DynamoDB 表结构
- [x] 搭建基础项目结构（目录、路由、布局）

## Phase 1: 基础设施 + 数据源管理（第 1-2 周） ✅

### 1.1 AWS 基础设施（CDK）
- [x] VPC + 子网 + 安全组
- [x] Cognito User Pool
- [x] DynamoDB Tables
- [ ] ECS Fargate Cluster（平台部署用）
- [ ] S3 Table Bucket
- [x] Redshift Serverless Namespace + Workgroup
- [ ] MWAA Environment
- [ ] OpenMetadata on ECS Fargate

### 1.2 用户认证模块
- [x] Cognito 集成（登录/注册/Token 刷新）
- [ ] RBAC 权限模型（Admin / Developer / Viewer）
- [x] 登录页面 + 布局框架

### 1.3 数据源管理模块
- [x] 数据源 CRUD API（DynamoDB）
- [x] 数据源配置页面（表单：host/port/user/password/database）
- [x] 连通性测试（调 Glue Connection API 或 DMS test-connection）
- [x] 数据源列表页面
- [x] 支持的数据源类型：MySQL, PostgreSQL, Oracle, SQL Server

## Phase 2: 数据同步模块（第 3-4 周） ✅

### 2.1 同步任务配置
- [x] 源端配置：选择数据源 → 选择库/表（从源库动态拉取）
- [x] 目标端配置：S3 Tables (Iceberg) 或 Redshift
- [x] 分区配置：选择分区字段、分区类型（日期/数值/字符串）
- [x] 写入模式：Append / Overwrite / Merge (Upsert)
- [x] Redshift 配置：排序键 (SORTKEY)、分布键 (DISTKEY)
- [x] 同步模式：全量 / 增量 (CDC)

### 2.2 同步引擎对接
- [x] Zero-ETL 通道：调 Glue create-integration API
- [x] Glue ETL 通道：生成 Glue Job 脚本（PySpark）→ 调 Glue API 创建 Job
- [x] DMS 通道：调 DMS API 创建复制任务（CDC 场景）
- [ ] 自动选择通道逻辑（源类型 → 推荐最优通道）

### 2.3 同步任务管理
- [x] 任务列表页面（状态、最近运行时间、数据量）
- [ ] 任务详情页面（配置信息、运行历史）
- [x] 手动触发执行
- [x] 任务启停控制

## Phase 3: ETL 编排 + 调度（第 5-6 周） ✅

### 3.1 DAG 可视化编辑器
- [x] ReactFlow 画布集成
- [x] 节点类型定义：
  - 数据同步节点（关联 Phase 2 的同步任务）
  - SQL 节点（Redshift SQL 执行）
  - Python 节点（自定义脚本）
  - 条件分支节点
  - 通知节点（邮件/钉钉/企业微信）
- [x] 节点配置面板（点击节点弹出配置）
- [x] 连线（依赖关系）
- [x] DAG 保存 / 加载
- [x] DAG → Airflow DAG 文件转换

### 3.2 调度配置
- [x] Cron 表达式配置（可视化 Cron 选择器）
- [x] 手动触发
- [ ] 依赖触发（上游任务完成后自动触发）
- [x] 调度开关（启用/暂停）

### 3.3 MWAA 对接
- [x] DAG 文件推送到 MWAA S3 Bucket
- [x] Airflow REST API 集成（触发/暂停/查询状态）
- [ ] DAG 运行历史拉取

## Phase 4: Redshift 任务 + 监控（第 7 周） ✅

### 4.1 Redshift 任务模块
- [x] SQL 编辑器页面（Monaco Editor）
- [x] SQL 执行（Redshift Data API，异步）
- [x] 执行结果展示（表格 + 导出）
- [x] SQL 任务保存 / 版本管理
- [x] 常用 SQL 模板（MERGE、CREATE TABLE AS 等）

### 4.2 监控大盘
- [x] 全局任务概览（运行中/成功/失败 数量统计）
- [ ] 任务运行时间线（甘特图）
- [x] 失败任务告警列表
- [x] 单任务日志查看（Glue Job Logs / Airflow Task Logs）
- [ ] 告警通知配置（SNS → 邮件/钉钉/企业微信 Webhook）

## Phase 5: 数据治理 - OpenMetadata 集成（第 8-9 周）

### 5.1 OpenMetadata 部署
- [ ] ECS Fargate 部署 OpenMetadata
- [ ] 配置 Ingestion Connectors：
  - MySQL Connector（采集源库元数据）
  - Redshift Connector（采集表结构 + 列级血缘）
  - Glue Connector（采集 Glue Data Catalog）
  - Airflow Connector（采集 DAG 执行血缘）
  - S3 Connector（采集 S3 数据资产）

### 5.2 平台集成
- [x] 数据治理入口页面（iframe 嵌入 OpenMetadata UI）
- [ ] 数据目录搜索（调 OpenMetadata API，在平台内展示）
- [ ] 血缘图展示（调 OpenMetadata Lineage API）
- [ ] 数据地图（按业务域/主题域组织数据资产）
- [ ] SSO 打通（Cognito → OpenMetadata 认证）

## Phase 6: 完善 + 扩展（第 10+ 周）

- [ ] 更多数据源支持（MongoDB、DynamoDB、Kafka 等）
- [ ] 数据质量规则配置（OpenMetadata Data Quality）
- [ ] 流式任务管理（Flink on EMR Serverless）
- [ ] 成本监控（各 AWS 服务用量统计）
- [ ] 操作审计日志
- [ ] 多环境管理（Dev / Staging / Prod）
- [ ] API 开放（供外部系统调用）

---

## 每次开发前，请先查看此文件确认当前进度
## 完成一个 Task 后，将 [ ] 改为 [x] 并 commit

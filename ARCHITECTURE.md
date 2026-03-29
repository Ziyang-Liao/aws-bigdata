# 技术架构详细设计 / Technical Architecture

## 1. 项目结构

```
bigdata-governance-platform/
├── README.md                    # 项目说明
├── ROADMAP.md                   # 实施计划（进度追踪）
├── ARCHITECTURE.md              # 本文件（技术架构）
├── DEVLOG.md                    # 开发日志（每次开发记录）
│
├── platform/                    # 主应用（Next.js）
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/                 # App Router 页面
│   │   │   ├── layout.tsx       # 全局布局（侧边栏 + 顶栏）
│   │   │   ├── page.tsx         # 首页（Dashboard）
│   │   │   ├── login/           # 登录页
│   │   │   ├── datasources/     # 数据源管理
│   │   │   │   ├── page.tsx     # 数据源列表
│   │   │   │   └── [id]/        # 数据源详情/编辑
│   │   │   ├── sync/            # 数据同步
│   │   │   │   ├── page.tsx     # 同步任务列表
│   │   │   │   ├── new/         # 新建同步任务
│   │   │   │   └── [id]/        # 任务详情
│   │   │   ├── workflow/        # ETL 工作流编排
│   │   │   │   ├── page.tsx     # 工作流列表
│   │   │   │   └── [id]/        # DAG 编辑器页面
│   │   │   ├── schedule/        # 调度管理
│   │   │   ├── redshift/        # Redshift 任务
│   │   │   │   ├── page.tsx     # SQL 编辑器
│   │   │   │   └── tasks/       # 任务管理
│   │   │   ├── monitor/         # 监控大盘
│   │   │   └── governance/      # 数据治理（OpenMetadata 集成）
│   │   │
│   │   ├── api/                 # API Routes
│   │   │   ├── auth/            # 认证相关
│   │   │   ├── datasources/     # 数据源 CRUD
│   │   │   ├── sync/            # 同步任务
│   │   │   ├── workflow/        # 工作流
│   │   │   ├── schedule/        # 调度
│   │   │   ├── redshift/        # Redshift 操作
│   │   │   └── monitor/         # 监控数据
│   │   │
│   │   ├── components/          # 共享组件
│   │   │   ├── layout/          # 布局组件（Sidebar, Header）
│   │   │   ├── dag-editor/      # DAG 编辑器组件（ReactFlow）
│   │   │   ├── sql-editor/      # SQL 编辑器组件（Monaco）
│   │   │   └── common/          # 通用组件
│   │   │
│   │   ├── lib/                 # 工具库
│   │   │   ├── aws/             # AWS SDK 封装
│   │   │   │   ├── glue.ts      # Glue API
│   │   │   │   ├── dms.ts       # DMS API
│   │   │   │   ├── redshift.ts  # Redshift Data API
│   │   │   │   ├── mwaa.ts      # MWAA (Airflow) API
│   │   │   │   ├── dynamodb.ts  # DynamoDB 操作
│   │   │   │   └── cognito.ts   # Cognito 认证
│   │   │   ├── openmetadata/    # OpenMetadata API 封装
│   │   │   └── utils/           # 通用工具
│   │   │
│   │   └── types/               # TypeScript 类型定义
│   │       ├── datasource.ts
│   │       ├── sync-task.ts
│   │       ├── workflow.ts
│   │       └── schedule.ts
│   │
│   └── public/                  # 静态资源
│
├── infra/                       # CDK 基础设施代码
│   ├── package.json
│   ├── bin/
│   │   └── app.ts               # CDK App 入口
│   ├── lib/
│   │   ├── vpc-stack.ts         # VPC + 网络
│   │   ├── auth-stack.ts        # Cognito
│   │   ├── database-stack.ts    # DynamoDB Tables
│   │   ├── redshift-stack.ts    # Redshift Serverless
│   │   ├── s3-tables-stack.ts   # S3 Table Bucket
│   │   ├── mwaa-stack.ts        # MWAA Environment
│   │   ├── platform-stack.ts    # ECS Fargate (平台部署)
│   │   └── openmetadata-stack.ts # OpenMetadata on ECS
│   └── cdk.json
│
└── docs/                        # 补充文档
    ├── api-design.md            # API 接口设计
    ├── database-schema.md       # DynamoDB 表设计
    └── deployment.md            # 部署指南
```

## 2. DynamoDB 表设计

### 2.1 DataSources 表（数据源）

```
Table: bgp-datasources
PK: userId (String)
SK: datasourceId (String, ULID)

Attributes:
  - name: String              # 数据源名称
  - type: String              # mysql | postgresql | oracle | sqlserver
  - host: String              # 主机地址
  - port: Number              # 端口
  - database: String          # 数据库名
  - username: String          # 用户名（加密存储）
  - credentialArn: String     # Secrets Manager ARN（存密码）
  - status: String            # active | inactive | error
  - glueConnectionName: String # 对应的 Glue Connection 名称
  - createdAt: String (ISO)
  - updatedAt: String (ISO)
```

### 2.2 SyncTasks 表（同步任务）

```
Table: bgp-sync-tasks
PK: userId (String)
SK: taskId (String, ULID)

Attributes:
  - name: String              # 任务名称
  - datasourceId: String      # 关联数据源
  - sourceDatabase: String    # 源库
  - sourceTables: List<String> # 源表列表
  - targetType: String        # s3-tables | redshift | both
  - s3Config:
      - tableBucketArn: String
      - namespace: String
      - partitionFields: List<{field, type}>  # 分区配置
  - redshiftConfig:
      - workgroupName: String
      - database: String
      - schema: String
      - sortKeys: List<String>    # 排序键
      - distKey: String           # 分布键
      - distStyle: String         # auto | key | even | all
  - syncMode: String          # full | incremental
  - writeMode: String         # append | overwrite | merge
  - mergeKeys: List<String>   # merge 模式的主键
  - channel: String           # zero-etl | glue | dms
  - status: String            # draft | running | stopped | error
  - glueJobName: String       # 对应的 Glue Job
  - integrationArn: String    # Zero-ETL integration ARN
  - cronExpression: String    # 调度表达式
  - createdAt: String (ISO)
  - updatedAt: String (ISO)
```

### 2.3 Workflows 表（工作流）

```
Table: bgp-workflows
PK: userId (String)
SK: workflowId (String, ULID)

Attributes:
  - name: String
  - description: String
  - dagDefinition: Map        # ReactFlow 的 nodes + edges JSON
  - airflowDagId: String      # 对应的 Airflow DAG ID
  - cronExpression: String
  - scheduleEnabled: Boolean
  - status: String            # draft | active | paused | error
  - lastRunAt: String (ISO)
  - lastRunStatus: String
  - createdAt: String (ISO)
  - updatedAt: String (ISO)
```

### 2.4 RedshiftTasks 表（Redshift 任务）

```
Table: bgp-redshift-tasks
PK: userId (String)
SK: taskId (String, ULID)

Attributes:
  - name: String
  - sql: String               # SQL 内容
  - workgroupName: String
  - database: String
  - cronExpression: String
  - scheduleEnabled: Boolean
  - status: String
  - createdAt: String (ISO)
  - updatedAt: String (ISO)
```

## 3. API 设计概览

```
# 认证
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

# 数据源
GET    /api/datasources              # 列表
POST   /api/datasources              # 创建
GET    /api/datasources/:id          # 详情
PUT    /api/datasources/:id          # 更新
DELETE /api/datasources/:id          # 删除
POST   /api/datasources/:id/test     # 测试连通性
GET    /api/datasources/:id/schemas  # 获取库列表
GET    /api/datasources/:id/tables   # 获取表列表
GET    /api/datasources/:id/columns  # 获取字段列表

# 同步任务
GET    /api/sync                     # 列表
POST   /api/sync                     # 创建
GET    /api/sync/:id                 # 详情
PUT    /api/sync/:id                 # 更新
DELETE /api/sync/:id                 # 删除
POST   /api/sync/:id/start           # 启动
POST   /api/sync/:id/stop            # 停止
GET    /api/sync/:id/runs            # 运行历史
GET    /api/sync/:id/logs            # 日志

# 工作流
GET    /api/workflow                  # 列表
POST   /api/workflow                  # 创建
GET    /api/workflow/:id             # 详情（含 DAG 定义）
PUT    /api/workflow/:id             # 更新（保存 DAG）
DELETE /api/workflow/:id             # 删除
POST   /api/workflow/:id/publish     # 发布到 Airflow
POST   /api/workflow/:id/trigger     # 手动触发
GET    /api/workflow/:id/runs        # 运行历史

# 调度
GET    /api/schedule                 # 所有调度任务
PUT    /api/schedule/:id             # 更新调度配置
POST   /api/schedule/:id/enable      # 启用
POST   /api/schedule/:id/disable     # 暂停

# Redshift
POST   /api/redshift/execute         # 执行 SQL
GET    /api/redshift/result/:id      # 获取执行结果
GET    /api/redshift/tasks           # 任务列表
POST   /api/redshift/tasks           # 创建任务
PUT    /api/redshift/tasks/:id       # 更新
DELETE /api/redshift/tasks/:id       # 删除

# 监控
GET    /api/monitor/overview         # 全局概览统计
GET    /api/monitor/tasks            # 任务运行列表
GET    /api/monitor/tasks/:id/logs   # 任务日志
GET    /api/monitor/alerts           # 告警列表
POST   /api/monitor/alerts/config    # 告警配置

# 数据治理（代理 OpenMetadata API）
GET    /api/governance/search        # 数据资产搜索
GET    /api/governance/lineage/:fqn  # 血缘查询
GET    /api/governance/tables        # 表目录
GET    /api/governance/tags          # 标签/分类
```

## 4. OpenMetadata 集成方案

### 部署
- ECS Fargate 部署 OpenMetadata Server + Ingestion
- RDS PostgreSQL 作为 OpenMetadata 后端数据库
- ElasticSearch (OpenSearch) 作为搜索引擎

### Connectors 配置
```yaml
# 自动采集以下数据源的元数据
connectors:
  - type: mysql           # 采集源库表结构
  - type: redshift        # 采集 Redshift 表结构 + SQL 血缘
  - type: glue             # 采集 Glue Data Catalog
  - type: s3               # 采集 S3 数据资产
  - type: airflow          # 采集 Airflow DAG 执行血缘
```

### 集成方式
1. iframe 嵌入：数据治理页面直接嵌入 OpenMetadata Web UI
2. API 调用：在平台内展示血缘图、数据目录时调 OpenMetadata REST API
3. SSO 打通：Cognito → OpenMetadata OIDC 认证

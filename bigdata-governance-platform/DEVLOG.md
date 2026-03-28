# 开发日志 / Development Log

> **项目位置**: `aws-bigdata/bigdata-governance-platform/`
> **仓库地址**: https://github.com/Ziyang-Liao/aws-bigdata.git
>
> **每次新会话开始时，请先阅读此文件最后一条记录的「下次继续」部分。**
> **然后阅读 `ROADMAP.md` 查看整体进度。**

---

## 2026-03-28 Session 1: 项目规划与架构设计

### 背景
需要构建一个大数据开发治理平台，实现：
- 数据从 MySQL/RDS 同步到 S3 Tables (Iceberg)，支持分区配置
- 数据增量更新到 Redshift，支持排序键/分布键配置
- 也可通过 Redshift 外部表增量拉取到物理表
- 可视化 ETL 编排（拖拉拽）
- 任务调度与监控
- 数据血缘（列级）、数据地图、数据目录

### 方案调研与决策

1. **排除 DataSphere Studio (DSS)**
   - 原因：完全基于 Hadoop 生态，不支持 AWS S3 Tables/Redshift
   - 数据血缘模块（DataModelCenter）标注开发中但至今未发布
   - 社区活跃度低

2. **排除纯 SageMaker Unified Studio 方案**
   - 原因：数据血缘/数据地图能力不足
   - 但其 Visual ETL 和 Visual Workflow 可作为底层引擎

3. **最终方案：自建 Web 门户 + AWS 托管服务 + OpenMetadata**
   - 自建部分：UI 层 + API 编排层（Next.js 全栈）
   - 底层引擎：AWS Glue / DMS / Zero-ETL / MWAA / Redshift
   - 数据治理：OpenMetadata（部署在 ECS Fargate）
   - 数据同步双通道：Zero-ETL（优先）+ Glue ETL（兜底）

### 完成内容
- [x] 确定整体架构方案
- [x] 确定技术栈
- [x] 创建项目文档：
  - `README.md` - 项目说明 + 架构总览
  - `ROADMAP.md` - 分阶段实施计划（含 checkbox 追踪）
  - `ARCHITECTURE.md` - 技术架构（项目结构、DB Schema、API 设计、OpenMetadata 集成）
  - `DEVLOG.md` - 本文件
- [x] 推送到 GitHub 仓库

### 关键技术栈
| 组件 | 用途 |
|------|------|
| Next.js 14 + Ant Design 5 | 全栈 Web 应用 |
| ReactFlow | DAG 拖拉拽编辑器 |
| Monaco Editor | SQL 编辑器 |
| AWS Glue | ETL 执行引擎 |
| AWS DMS / Zero-ETL | 数据同步 |
| MWAA (Airflow) | 工作流调度 |
| Redshift Data API | SQL 执行 |
| OpenMetadata | 数据治理（血缘/目录/质量） |
| DynamoDB | 平台元数据存储 |
| Cognito | 用户认证 |
| CDK | 基础设施即代码 |

### 下次继续
- [ ] 初始化 Next.js 项目（`platform/` 目录）
- [ ] 初始化 CDK 项目（`infra/` 目录）
- [ ] 搭建基础布局（侧边栏 + 顶栏 + 路由）
- [ ] 开始 Phase 1.3：数据源管理模块（CRUD + 连通性测试）

### 启动命令备忘
```bash
# 克隆仓库
git clone https://github.com/Ziyang-Liao/aws-bigdata.git
cd aws-bigdata/bigdata-governance-platform

# 启动开发（项目初始化后可用）
cd platform && npm run dev

# CDK 部署（基础设施初始化后可用）
cd infra && npx cdk deploy --all
```

---

## 2026-03-28 Session 1 (续): 项目初始化

### 完成内容
- [x] 初始化 Next.js 14 项目（`platform/`）
- [x] 安装核心依赖：Ant Design 5, ReactFlow, Monaco Editor, AWS SDK
- [x] 搭建基础布局（侧边栏导航 + 顶栏用户菜单）
- [x] 创建 Dashboard 首页（统计卡片）
- [x] 创建登录页
- [x] 创建 9 个模块占位页面（数据源/同步/编排/调度/Redshift/监控/权限/审计/治理）
- [x] 创建 TypeScript 类型定义（DataSource, SyncTask, Workflow, Permission）
- [x] 创建 AWS SDK 封装（DynamoDB, Glue, Redshift, Cognito, Lake Formation, SNS）
- [x] 初始化 CDK 项目（`infra/`）
- [x] CDK: VPC Stack（2 AZ, public + private subnets）
- [x] CDK: Database Stack（6 张 DynamoDB 表）
- [x] CDK: Auth Stack（Cognito User Pool + 4 个 RBAC Group）
- [x] Next.js build 验证通过
- [x] 全部推送到 GitHub

### 当前项目结构
```
bigdata-governance-platform/
├── README.md / ROADMAP.md / ARCHITECTURE.md / DEVLOG.md
├── platform/          # Next.js 全栈应用（已初始化，可 build）
│   └── src/
│       ├── app/       # 11 个页面路由
│       ├── components/layout/  # AppLayout 侧边栏布局
│       ├── lib/aws/   # 6 个 AWS SDK 封装
│       └── types/     # 4 个类型定义文件
└── infra/             # CDK 基础设施（3 个 Stack）
    └── lib/           # vpc / database / auth
```

### 下次继续
- [ ] 开始 Phase 1.3：数据源管理模块
  - [ ] 数据源 CRUD API（`/api/datasources`）
  - [ ] 数据源列表页面（表格 + 新建/编辑/删除）
  - [ ] 数据源配置表单（host/port/user/password/database）
  - [ ] 连通性测试功能
- [ ] 启动开发服务器命令：`cd platform && npm run dev`

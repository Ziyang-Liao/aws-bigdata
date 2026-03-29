# 开发日志 / Development Log

每次开发会话记录在此文件，方便下次继续。

---

## 2026-03-28 Session 1: 项目规划

### 完成内容
1. 确定整体架构方案：自建 Web 门户 + AWS 托管服务 + OpenMetadata
2. 调研并排除了 DataSphere Studio（不适合 AWS 生态）
3. 确定技术栈：Next.js + Ant Design + ReactFlow + Monaco Editor
4. 创建项目规划文档：
   - `README.md` - 项目说明 + 架构总览
   - `ROADMAP.md` - 分阶段实施计划（含 checkbox 追踪）
   - `ARCHITECTURE.md` - 技术架构详细设计（项目结构、DB Schema、API 设计）
   - `DEVLOG.md` - 本文件

### 关键决策
- 底层引擎全部用 AWS 托管服务，不自建
- 数据同步双通道：Zero-ETL（优先）+ Glue ETL（兜底）
- 数据治理直接集成 OpenMetadata，不自建血缘/目录
- 一个人开发，全栈 Next.js，不拆微服务
- 元数据存 DynamoDB，免运维

### 下次继续
- [ ] 创建 GitHub 仓库并推送以上文档
- [ ] 初始化 Next.js 项目（platform/ 目录）
- [ ] 初始化 CDK 项目（infra/ 目录）
- [ ] 搭建基础布局（侧边栏 + 顶栏 + 路由）
- [ ] 开始 Phase 1.3：数据源管理模块

### 备注
- 用户 GitHub 仓库名：bigdata-governance-platform
- 用户需要先执行 `gh auth login` 登录 GitHub
- 或者在 https://github.com/new 手动创建仓库

---

## 2026-03-29 Session 2: 项目脚手架搭建

### 完成内容
1. 初始化 Next.js 14 项目（platform/）：手动创建，安装 next@14 + react + antd + tailwindcss@3
2. 搭建基础布局：侧边栏（8个导航项）+ 顶栏（用户头像）+ Ant Design ConfigProvider
3. 创建所有模块占位页面：首页(Dashboard)、数据源、同步、ETL编排、调度、Redshift、监控、治理
4. 初始化 CDK 项目（infra/）：VpcStack + DatabaseStack
5. CDK DatabaseStack 定义 4 张 DynamoDB 表（PAY_PER_REQUEST）
6. Next.js build 验证通过，CDK tsc 编译通过

### 关键决策
- 后续所有 AWS 资源使用 `temp-account` profile 部署（账号 470377450205）
- tailwindcss 使用 v3（v4 与 Next.js 14 不兼容）
- Ant Design preflight 关闭（corePlugins.preflight: false）避免与 Tailwind 冲突

### 下次继续
- [ ] CDK 部署 VPC + DynamoDB 到 temp-account
- [ ] 开始 Phase 1.2：Cognito 用户认证模块
- [ ] 开始 Phase 1.3：数据源管理模块（CRUD + 连通性测试）

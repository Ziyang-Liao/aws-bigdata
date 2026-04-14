# 项目状态与后续计划

> 更新时间: 2026-03-30 10:00 UTC
> 平台地址: http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com
> GitHub: https://github.com/Ziyang-Liao/aws-bigdata/tree/main/bigdata-governance-platform
> 临时账号: 470377450205 (profile: temp-account)

---

## 一、项目结构

```
bigdata-governance-platform/
├── platform/          # Next.js 14 前端+API (ECS Fargate 部署)
├── infra/             # CDK TypeScript (基础设施)
├── e2e/               # Playwright E2E 测试脚本
├── docs/
│   ├── GAP-ANALYSIS.md        # 功能差距分析 (115项)
│   ├── DETAILED-DESIGN.md     # 实施计划总览
│   └── design/                # 74份详细设计文档
│       ├── 01-datasource/     # DS-01~18
│       ├── 02-sync/           # SYNC-01~17
│       ├── 03-workflow/       # WF-01~08
│       ├── 04-redshift/       # RS-01~06
│       ├── 05-schedule/       # SCH-01~05
│       ├── 06-monitor/        # MON-01~06
│       ├── 07-governance/     # GOV-01~04
│       ├── 08-auth/           # AUTH-01~04
│       └── 09-platform/       # PLT-01~05
├── ROADMAP.md
├── DEVLOG.md
└── ARCHITECTURE.md
```

## 二、已部署的 AWS 资源

| 资源 | 标识 |
|------|------|
| VPC | vpc-0c0289626d1aa4620 (2AZ, 公有+私有子网) |
| RDS MySQL | bgp-source-mysql (私有子网, ecommerce库) |
| Redshift Serverless | bgp-workgroup / bgp-namespace |
| Cognito | us-east-1_JnGwRjVco / admin用户 |
| DynamoDB | 7张表 (datasources/sync-tasks/workflows/redshift-tasks/task-runs/sql-history/lineage) |
| ECS Fargate | bgp-cluster / bgp-platform (ALB公网) |
| Glue | bgp-glue-role / bgp-mysql-connection / 多个sync Job |
| S3 | bgp-datalake-470377450205 / bgp-glue-scripts-470377450205 / bgp-mwaa-dags-470377450205 |
| Secrets Manager | bgp/datasource/* (数据源密码) |

## 三、已完成功能 ✅

### 数据源管理
- [x] DS-01 自动创建 Glue Connection
- [x] DS-02 自动 IAM Role
- [x] DS-03 自动网络配置 (VPC/子网/安全组)
- [x] DS-04 密码加密存储 (Secrets Manager)
- [x] DS-06 RDS 实例自动发现
- [x] DS-16 连接测试详细报告 (5步检查)
- [x] 元数据浏览 (库/表/字段)
- [x] 3步创建向导 (基本信息→连接配置→资源创建)

### 数据同步
- [x] SYNC-01 通道自动推荐 (Glue/Zero-ETL/DMS)
- [x] SYNC-02 字段类型自动映射 (MySQL/PG→Redshift)
- [x] SYNC-04 WHERE 数据过滤 (含变量)
- [x] SYNC-05 增量配置 (时间戳/ID/CDC)
- [x] SYNC-06 目标表自动建表 (DDL预览+执行)
- [x] SYNC-09 运行历史记录 (自动创建+完成更新)
- [x] SYNC-10 任务详情页 (日志/输出/历史/映射)
- [x] SYNC-14 S3 Bucket 下拉选择
- [x] SYNC-15 Redshift 下拉选择
- [x] 5步创建向导 (源端→选表映射→目标→建表→调度)
- [x] Glue Job 自动创建+启动+状态轮询
- [x] S3 输出文件列表
- [x] CloudWatch 日志查看

### ETL 编排
- [x] ReactFlow DAG 编辑器 (同步/SQL/Python 节点)
- [x] 节点配置面板 (Drawer)
- [x] WF-03 节点状态可视化 (5种颜色)
- [x] DAG→Airflow DAG 文件生成
- [x] 发布到 S3 / 触发运行

### Redshift 查询
- [x] 连接配置 (Workgroup/Database 动态获取)
- [x] Schema 浏览树 (表+字段+类型)
- [x] Monaco SQL 编辑器
- [x] RS-03 执行历史
- [x] RS-06 取消查询
- [x] SQL 模板 / 任务保存

### 调度管理
- [x] SCH-01 可视化 Cron 编辑器 (6种模式+预览)
- [x] 调度开关
- [x] 自动刷新

### 任务监控
- [x] MON-01 实时刷新 (5s/10s/30s)
- [x] MON-03 告警规则配置
- [x] 统计卡片 + 分Tab列表

### 数据治理
- [x] GOV-01 数据目录自动采集 (Glue+Redshift)
- [x] GOV-02 血缘自动生成 (同步任务→血缘记录)
- [x] GOV-03 血缘可视化 (ReactFlow)

### 用户权限
- [x] AUTH-01 用户身份解析 (JWT)
- [x] AUTH-02 RBAC (Admin/Developer/Viewer)
- [x] AUTH-03 用户管理页面

### 平台基础
- [x] PLT-01 统一错误处理 (apiOk/apiError)
- [x] PLT-04 系统设置页 (配置+服务状态)
- [x] 所有API force-dynamic (环境变量修复)

## 四、待完成功能 (按优先级)

### P0 必须
- [ ] DS-05 连接状态心跳检测 (EventBridge+Lambda)
- [ ] SYNC-07 目标表名映射 (前缀/后缀)
- [ ] WF-04 节点日志查看
- [ ] WF-07 运行历史
- [ ] SCH-03 依赖调度
- [ ] AUTH-04 操作审计日志
- [ ] PLT-02 加载状态优化 (骨架屏)
- [ ] PLT-03 表单校验增强

### P1 重要
- [ ] DS-07 更多数据源类型
- [ ] DS-08 SSL/TLS
- [ ] DS-11 权限控制
- [ ] DS-12 数据预览
- [ ] SYNC-03 字段转换函数 (脱敏)
- [ ] SYNC-08 多表批量配置
- [ ] SYNC-11 错误处理策略
- [ ] SYNC-12 通知配置
- [ ] WF-01 更多节点类型
- [ ] WF-05 DAG 校验
- [ ] WF-06 版本管理
- [ ] RS-01 SQL 自动补全
- [ ] RS-04 结果导出
- [ ] MON-02 甘特图
- [ ] MON-04 通知渠道
- [ ] GOV-04 数据质量规则

### P2 增强
- [ ] DS-09~10,13~15,17~18
- [ ] SYNC-13,16,17
- [ ] RS-02,05
- [ ] SCH-02,04,05
- [ ] MON-05,06

## 五、E2E 验证方式

```bash
# 运行全量验证 (44项检查)
cd e2e && node verify.js

# 运行数据源创建流程验证 (真人操作模拟)
cd e2e && node flow1-datasource.js

# 截图保存在
e2e/screenshots/
```

验证脚本使用 Playwright 无头浏览器，模拟真人点击操作。

## 六、开发/部署命令

```bash
# 本地开发
cd platform && npm run dev

# 构建
cd platform && npx next build

# 部署到 ECS (temp-account)
date > platform/.build-timestamp  # 强制镜像更新
cd infra && npx cdk deploy BgpPlatformStack --profile temp-account --require-approval never

# 部署 DynamoDB 新表
cd infra && npx cdk deploy BgpDatabaseStack --profile temp-account --require-approval never

# 提交到 GitHub
rsync -a --delete --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='cdk.out' --exclude='.env.local' --exclude='e2e' \
  /data/bigdata-governance-platform/ /tmp/aws-bigdata/bigdata-governance-platform/
cd /tmp/aws-bigdata && git add -A && git commit -m "msg" && git push origin main
```

## 七、已知问题

1. 数据源创建后前端没有自动跳转到 Step 3 确认页 (需检查 handleSubmit 逻辑)
2. Glue TestConnection API 不支持旧版 JDBC Connection (已改为配置验证)
3. 部分旧数据源缺少 secretArn (手动补充过)
4. 同步任务 "test" 状态异常 (需清理)

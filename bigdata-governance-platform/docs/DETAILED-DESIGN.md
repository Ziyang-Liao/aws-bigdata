# 大数据治理平台 — 实施计划与详细设计

> 版本: v2.0 | 日期: 2026-03-29
> 基于 GAP-ANALYSIS.md 的差距分析，按优先级排列实施计划

---

## 一、实施阶段总览

| 阶段 | 周期 | 核心目标 | P0 项数 |
|------|------|---------|---------|
| Phase A | 第 1-2 周 | 自动化基础设施 + 核心交互完善 | 15 |
| Phase B | 第 3-4 周 | 同步引擎增强 + 监控告警 | 12 |
| Phase C | 第 5-6 周 | 工作流增强 + 数据治理 | 10 |
| Phase D | 第 7-8 周 | 权限体系 + 高级功能 | 8 |

---

## 二、Phase A 详细设计：自动化基础设施 + 核心交互

### A1. 数据源创建自动化（1.1 ~ 1.4）

#### 设计目标
用户只需填写 host/port/user/password，后端自动完成：
1. 密码加密存储到 Secrets Manager
2. 创建 Glue Connection（含 VPC/子网/安全组配置）
3. 创建/复用 Glue IAM Role
4. 测试连通性并更新状态

#### API 设计

```
POST /api/datasources
Request:
{
  "name": "业务主库",
  "type": "mysql",
  "host": "xxx.rds.amazonaws.com",
  "port": 3306,
  "database": "ecommerce",
  "username": "admin",
  "password": "xxx"
}

Response:
{
  "datasourceId": "xxx",
  "status": "testing",           // testing → active / error
  "secretArn": "arn:aws:secretsmanager:...",
  "glueConnectionName": "bgp-conn-xxx",
  "networkConfig": {
    "vpcId": "vpc-xxx",
    "subnetId": "subnet-xxx",
    "securityGroupId": "sg-xxx"
  },
  "testResult": {
    "networkReachable": true,
    "authSuccess": true,
    "permissions": ["SELECT", "SHOW DATABASES"],
    "latencyMs": 45
  }
}
```

#### 后端流程

```
用户提交 → 
  1. 存密码到 Secrets Manager (bgp/datasource/{id})
  2. 查询 RDS 实例获取 VPC/子网信息
     - 调 RDS DescribeDBInstances (按 endpoint 匹配)
     - 如果是非 RDS 地址，使用平台默认 VPC
  3. 创建安全组 (bgp-ds-{id}-sg)
     - Ingress: 允许 Glue 安全组访问目标端口
     - 自动关联到 Glue 安全组
  4. 创建 Glue Connection
     - JDBC URL 自动拼接
     - 关联 VPC/子网/安全组
  5. 测试连通性
     - 调 Glue TestConnection API
     - 返回详细结果（网络/认证/权限）
  6. 更新 DynamoDB 状态
```

#### 前端交互

```
创建数据源弹窗改为 3 步：
Step 1: 基本信息
  - 数据源名称
  - 类型选择（带图标和说明）
  - 环境标签（dev/staging/prod）

Step 2: 连接配置
  - 方式一：手动填写 host/port
  - 方式二：从 RDS 实例列表选择（自动填充 host/port/VPC 信息）
  - 数据库名
  - 用户名 / 密码
  - 高级选项（折叠）：SSL、字符集、时区、连接参数

Step 3: 测试 & 确认
  - 自动执行连接测试
  - 显示测试结果：
    ✅ 网络连通性: 可达 (45ms)
    ✅ 身份认证: 成功
    ✅ 权限检查: SELECT, SHOW DATABASES, SHOW TABLES
    ✅ Glue Connection: 已创建 (bgp-conn-xxx)
    ✅ 安全组: 已配置 (sg-xxx)
    ✅ 密码存储: Secrets Manager (bgp/datasource/xxx)
  - 失败时显示具体错误和修复建议
```

---

### A2. 同步任务核心增强（2.1, 2.2, 2.4, 2.5, 2.6, 2.12, 2.13, 2.20）

#### A2.1 通道自动推荐

```
推荐逻辑：
1. 源=MySQL/Aurora + 目标=Redshift + 模式=增量 → Zero-ETL（近实时，零运维）
2. 源=任意 JDBC + 目标=S3/Redshift + 模式=全量 → Glue ETL（通用）
3. 源=MySQL/PG/Oracle + 目标=任意 + 模式=CDC → DMS（持续复制）

前端展示：
  [推荐] Glue ETL — 通用 ETL 引擎，支持所有 JDBC 源
         适合：全量同步、批量 ETL
         预估耗时：~5 分钟（基于数据量）

  Zero-ETL — 近实时同步，零运维
  ⚠️ 当前源类型不支持 Zero-ETL（仅支持 MySQL/Aurora → Redshift）

  DMS CDC — 持续增量复制
  适合：需要实时同步变更的场景
```

#### A2.2 字段类型自动映射

```
映射规则表：
MySQL              → Redshift           → Parquet
INT/INTEGER        → INTEGER            → INT32
BIGINT             → BIGINT             → INT64
FLOAT              → REAL               → FLOAT
DOUBLE             → DOUBLE PRECISION   → DOUBLE
DECIMAL(p,s)       → DECIMAL(p,s)       → DECIMAL
VARCHAR(n)         → VARCHAR(n)         → STRING
TEXT               → VARCHAR(65535)     → STRING
DATE               → DATE               → DATE
DATETIME/TIMESTAMP → TIMESTAMP          → TIMESTAMP
BOOLEAN            → BOOLEAN            → BOOLEAN
JSON               → SUPER             → STRING

前端展示：
  源字段        源类型          →  目标类型           状态
  user_id      INT             →  INTEGER            ✅ 兼容
  username     VARCHAR(50)     →  VARCHAR(50)        ✅ 兼容
  metadata     JSON            →  SUPER              ⚠️ 需转换
  big_text     LONGTEXT        →  VARCHAR(65535)     ⚠️ 可能截断
```

#### A2.3 数据过滤条件

```
前端：
  过滤条件（WHERE）:
  ┌─────────────────────────────────────────────┐
  │ created_at >= '${run_date}' AND status = 1  │
  └─────────────────────────────────────────────┘
  支持变量: ${run_date} ${run_hour} ${yesterday}

  快捷条件:
  [+ 最近 N 天] [+ 指定字段范围] [+ 自定义 SQL]
```

#### A2.4 增量字段配置

```
前端（增量模式时显示）：
  增量策略:
    ○ 时间戳增量 — 基于时间字段，每次同步大于上次水位线的数据
    ○ 自增 ID 增量 — 基于自增主键
    ○ CDC 日志 — 基于 binlog/WAL（需 DMS 通道）

  增量字段: [updated_at ▼]  （从源表字段中选择）
  起始值:   [2026-01-01 00:00:00]  （首次同步的起始点）

  水位线管理:
    当前水位线: 2026-03-29 08:00:00
    上次同步: 2026-03-29 02:00:00 → 2026-03-29 08:00:00 (1,234 行)
```

#### A2.5 目标表自动建表

```
后端逻辑：
1. 根据源表 Schema + 字段映射 + 类型映射规则
2. 生成 CREATE TABLE DDL
3. 用户确认后自动执行

前端展示：
  目标表 DDL 预览:
  ┌──────────────────────────────────────────────────┐
  │ CREATE TABLE public.users (                      │
  │   user_id INTEGER NOT NULL,                      │
  │   username VARCHAR(50),                          │
  │   email VARCHAR(100),                            │
  │   user_level VARCHAR(20),                        │
  │   created_at TIMESTAMP                           │
  │ )                                                │
  │ DISTKEY(user_id)                                 │
  │ SORTKEY(created_at);                             │
  └──────────────────────────────────────────────────┘
  [编辑 DDL] [执行建表] [跳过（表已存在）]
```

#### A2.6 任务详情页

```
路由: /sync/{taskId}

布局:
┌─────────────────────────────────────────────────────┐
│ ← 返回  用户表全量同步          [编辑] [启动] [删除] │
├─────────────────────────────────────────────────────┤
│ 基本信息                                             │
│ 通道: Glue ETL | 模式: 全量/覆盖 | 状态: ● 运行中    │
│ 源: MySQL ecommerce.users → 目标: S3 + Redshift     │
│ 调度: 0 2 * * * (每天凌晨2点) | 下次: 2026-03-30    │
├─────────────────────────────────────────────────────┤
│ [运行历史] [配置详情] [字段映射] [日志]               │
├─────────────────────────────────────────────────────┤
│ 运行历史                                             │
│ #  开始时间          耗时    读取    写入    状态      │
│ 5  03-29 02:00:05   3m12s  8,234   8,234   ✅ 成功  │
│ 4  03-28 02:00:03   3m08s  8,100   8,100   ✅ 成功  │
│ 3  03-27 02:00:04   3m15s  7,980   7,980   ✅ 成功  │
│ 2  03-26 02:00:02   0m45s  0       0       ❌ 失败  │
│    错误: Connection refused (sg-xxx 未开放 3306)     │
│ 1  03-25 02:00:01   3m05s  7,800   7,800   ✅ 成功  │
├─────────────────────────────────────────────────────┤
│ 统计趋势 (最近 7 天)                                 │
│ [同步行数折线图] [耗时折线图] [成功率饼图]            │
└─────────────────────────────────────────────────────┘
```

---

### A3. 调度可视化 Cron 编辑器（5.1）

```
┌─────────────────────────────────────────────┐
│ 调度类型: ○ 分钟 ○ 小时 ● 每天 ○ 每周 ○ 每月 │
│                                              │
│ 执行时间:  [02] 时 [00] 分                    │
│                                              │
│ Cron 表达式: 0 2 * * *                        │
│                                              │
│ 下次 5 次执行:                                │
│   2026-03-30 02:00 (周一)                     │
│   2026-03-31 02:00 (周二)                     │
│   2026-04-01 02:00 (周三)                     │
│   2026-04-02 02:00 (周四)                     │
│   2026-04-03 02:00 (周五)                     │
└─────────────────────────────────────────────┘
```

---

### A4. 系统设置页面（9.9, 9.10）

```
路由: /settings

全局配置:
  AWS Region:        [us-east-1 ▼]
  默认 VPC:          [vpc-0c0289626d1aa4620 ▼] (自动发现)
  默认子网:          [subnet-00aed4243b32bc1ad ▼] (私有子网)
  Glue IAM Role:     arn:aws:iam::470377450205:role/bgp-glue-role
  Glue 脚本 Bucket:  bgp-glue-scripts-470377450205
  数据湖 Bucket:     bgp-datalake-470377450205
  MWAA DAG Bucket:   bgp-mwaa-dags-470377450205
  Redshift Workgroup: bgp-workgroup

服务状态检查:
  ✅ DynamoDB     — 4 张表正常
  ✅ Redshift     — bgp-workgroup (AVAILABLE)
  ✅ Glue         — 3 个 Connection, 4 个 Job
  ✅ S3           — 3 个 Bucket 可访问
  ⚠️ MWAA        — 未部署
  ⚠️ OpenMetadata — 未部署
```

---

## 三、Phase B 详细设计：同步引擎增强 + 监控告警

### B1. 运行历史与统计（2.12）

```
DynamoDB 新增表: bgp-task-runs
PK: taskId
SK: runId (ULID)

Attributes:
  - taskType: "sync" | "workflow"
  - status: "running" | "succeeded" | "failed"
  - startedAt: ISO timestamp
  - finishedAt: ISO timestamp
  - duration: Number (seconds)
  - metrics: {
      rowsRead: Number,
      rowsWritten: Number,
      bytesRead: Number,
      bytesWritten: Number,
      errorCount: Number
    }
  - error: String (失败原因)
  - glueJobRunId: String
  - triggeredBy: "schedule" | "manual" | "dependency"
```

### B2. 告警规则配置（6.3, 6.4）

```
DynamoDB 新增表: bgp-alert-rules
PK: userId
SK: ruleId

Attributes:
  - name: String
  - condition: {
      type: "task_failed" | "task_timeout" | "data_anomaly",
      taskIds: String[] (空=所有任务),
      threshold: Number (超时秒数/异常行数)
    }
  - channels: [{
      type: "email" | "wechat_webhook" | "dingtalk_webhook" | "sns",
      target: String (邮箱/Webhook URL/SNS Topic ARN)
    }]
  - enabled: Boolean

前端:
  告警规则列表
  [+ 新建规则]

  规则名称: 同步任务失败告警
  触发条件: 任务执行失败
  适用范围: ○ 所有任务 ● 指定任务 [用户表同步, 订单表同步]
  通知渠道:
    ✅ 邮件: admin@example.com
    ✅ 企业微信: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
    ☐ 钉钉
```

### B3. 字段转换函数（2.3）

```
前端（字段映射表新增"转换"列）：

  源字段      类型        →  转换              →  目标字段
  phone      VARCHAR     →  [脱敏: 手机号 ▼]  →  phone
  email      VARCHAR     →  [脱敏: 邮箱 ▼]    →  email
  amount     DECIMAL     →  [无 ▼]            →  amount
  created_at DATETIME    →  [格式化 ▼]        →  created_date
                            yyyy-MM-dd

转换函数列表:
  - 无（直接映射）
  - 脱敏: 手机号 (138****1234)
  - 脱敏: 邮箱 (z***@example.com)
  - 脱敏: 身份证
  - 类型转换: STRING → INT / DATE → STRING 等
  - 格式化: 日期格式转换
  - 表达式: 自定义 SQL 表达式
  - 默认值: 字段为 NULL 时的默认值
  - 拼接: 多字段拼接
```

---

## 四、Phase C 详细设计：工作流增强 + 数据治理

### C1. 节点运行状态可视化（3.3, 3.4）

```
DAG 编辑器增强:
  - 运行模式下，每个节点显示实时状态:
    ⏳ 等待中 (灰色)
    🔄 运行中 (蓝色 + 旋转动画)
    ✅ 成功 (绿色)
    ❌ 失败 (红色)
    ⏭️ 跳过 (黄色)

  - 节点上显示: 耗时、处理行数
  - 点击节点 → 弹出日志面板
  - 失败节点 → 显示错误信息 + [重跑] 按钮
```

### C2. 数据血缘自动生成（7.2, 7.3）

```
血缘数据来源:
  1. 同步任务配置 → 源表 → 目标表 (表级血缘)
  2. 字段映射配置 → 源字段 → 目标字段 (列级血缘)
  3. SQL 节点解析 → SQL 中的 FROM/JOIN/INSERT INTO (SQL 血缘)

存储:
  DynamoDB 新增表: bgp-lineage
  PK: targetFqn (如 redshift.dev.public.users)
  SK: sourceFqn (如 mysql.ecommerce.users)
  Attributes:
    - lineageType: "sync" | "sql" | "manual"
    - columnMappings: [{source: "user_id", target: "user_id"}]
    - taskId: String (关联的同步任务/工作流)
    - createdAt: ISO timestamp

前端:
  血缘图 (ReactFlow):
  ┌──────────┐     ┌──────────────┐     ┌──────────────┐
  │ MySQL    │────→│ S3 Parquet   │────→│ Redshift     │
  │ users    │     │ users/       │     │ public.users │
  └──────────┘     └──────────────┘     └──────────────┘
       │                                      │
       └──────────────────────────────────────┘
                    (字段级血缘)
  user_id ──→ user_id ──→ user_id
  username ──→ username ──→ username
```

---

## 五、Phase D 详细设计：权限体系

### D1. RBAC 权限模型（8.1, 8.2, 8.3）

```
角色定义:
  Admin:
    - 所有操作权限
    - 用户管理
    - 系统设置
    - 审计日志查看

  Developer:
    - 数据源: 查看、创建、编辑（仅自己创建的）
    - 同步任务: 全部操作
    - 工作流: 全部操作
    - Redshift: 查询、保存任务
    - 监控: 查看
    - 治理: 查看

  Viewer:
    - 所有模块: 只读
    - 不能创建/编辑/删除任何资源
    - 不能执行 SQL（防止误操作）

实现:
  - Cognito User Pool Groups: bgp-admin, bgp-developer, bgp-viewer
  - API 中间件: 从 JWT Token 获取 userId + groups
  - 前端: 根据角色隐藏/禁用操作按钮
```

---

## 六、技术债务清单

| # | 问题 | 影响 | 修复方案 |
|---|------|------|---------|
| T1 | API 无统一错误处理 | 前端收到不一致的错误格式 | 创建 API 中间件统一 { success, data, error } 格式 |
| T2 | DynamoDB Scan 全表扫描 | 数据量大时性能差 | 改用 Query + GSI |
| T3 | 密码明文存 DynamoDB | 安全风险 | 迁移到 Secrets Manager |
| T4 | 硬编码 default-user | 无多用户支持 | 从 Cognito Token 获取 |
| T5 | 无请求限流 | API 可能被滥用 | 添加 rate limiting |
| T6 | 无输入校验 | SQL 注入等安全风险 | 添加 zod schema 校验 |
| T7 | 前端无状态管理 | 组件间数据不同步 | 引入 zustand 或 SWR |
| T8 | 无单元测试 | 回归风险 | 添加 Jest + React Testing Library |
| T9 | CDK 无环境隔离 | dev/prod 混用 | CDK Context 区分环境 |
| T10 | 无 CI/CD | 手动部署 | GitHub Actions 自动化 |

---

## 七、总结

**当前完成度**: ~25%（基础框架 + 核心 CRUD）
**商用级目标**: 需完成 Phase A-D 全部 P0 + P1 项（约 65 项功能点）
**预估工期**: 8-10 周（1 人全栈开发）

**最高优先级（本周必须完成）**:
1. 数据源创建自动化（自动 Glue Connection + 安全组 + Secrets Manager）
2. 同步任务通道自动推荐 + 字段类型自动映射
3. 目标表自动建表
4. 任务运行历史记录
5. 可视化 Cron 编辑器

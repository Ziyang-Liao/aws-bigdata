# SYNC-06 目标表自动建表

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
根据源表 Schema + 字段映射 + 类型映射规则，自动生成目标表的 CREATE TABLE DDL。支持 DDL 预览、手动编辑、一键执行。Redshift DDL 自动包含 DISTKEY/SORTKEY 配置。

## 2. 用户故事
- 作为数据开发者，我希望系统自动生成目标表 DDL，不需要手动编写 CREATE TABLE 语句。
- 作为 DBA，我希望在执行前能预览和编辑 DDL，确保表结构符合规范。

## 3. 交互设计
```
同步任务 Step 4 目标配置 → 建表:
┌──────────────────────────────────────────────┐
│ 目标表: public.users                          │
│ 状态: ⚠️ 表不存在                             │
│                                               │
│ 自动生成 DDL:                                 │
│ ┌──────────────────────────────────────────┐  │
│ │ CREATE TABLE public.users (              │  │
│ │   user_id INTEGER NOT NULL,              │  │
│ │   username VARCHAR(50),                  │  │
│ │   email VARCHAR(100),                    │  │
│ │   user_level VARCHAR(20),                │  │
│ │   created_at TIMESTAMP                   │  │
│ │ )                                        │  │
│ │ DISTKEY(user_id)                         │  │
│ │ SORTKEY(created_at);                     │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ [编辑DDL] [执行建表] [跳过(表已存在)]          │
│                                               │
│ ✅ 表已存在时: ○ 跳过 ○ DROP重建 ○ ALTER追加列 │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync/generate-ddl
Request: {
  targetType: "redshift",
  tableName: "public.users",
  columns: [
    { name: "user_id", sourceType: "INT", targetType: "INTEGER", nullable: false },
    { name: "username", sourceType: "VARCHAR(50)", targetType: "VARCHAR(50)", nullable: true }
  ],
  redshiftConfig: { distKey: "user_id", sortKeys: ["created_at"], distStyle: "key" }
}
Response: {
  ddl: "CREATE TABLE public.users (\n  user_id INTEGER NOT NULL,\n  ...\n) DISTKEY(user_id) SORTKEY(created_at);",
  tableExists: false
}

POST /api/sync/execute-ddl
Request: { ddl: "CREATE TABLE ...", workgroupName: "bgp-workgroup", database: "dev" }
Response: { success: true }
```

## 5. 数据模型
无新增持久化数据，DDL 实时生成。

## 6. 后端实现方案
```
DDL 生成规则:
1. 遍历字段映射，使用 SYNC-02 类型映射转换类型
2. 主键字段添加 NOT NULL
3. Merge 模式的 mergeKeys 字段添加 PRIMARY KEY (Redshift 仅做查询优化提示)
4. 追加 DISTKEY/SORTKEY 子句
5. S3 目标: 生成 Glue Data Catalog CREATE TABLE (Hive DDL)

表存在检测:
- Redshift: SELECT 1 FROM information_schema.tables WHERE table_name = '{name}'
- S3: 检查 Glue Data Catalog 中是否存在

表已存在处理:
- 跳过: 不执行 DDL
- DROP 重建: DROP TABLE IF EXISTS + CREATE TABLE
- ALTER 追加列: 对比现有列和新列，生成 ALTER TABLE ADD COLUMN
```

## 7. AWS 服务依赖
- Redshift Data API (执行 DDL, 检查表存在)
- Glue Data Catalog (S3 目标建表)

## 8. 安全考虑
- DDL 执行前需用户确认
- DROP TABLE 操作需二次确认并记录审计日志
- DDL 中不包含敏感信息

## 9. 验收标准
- [ ] 根据字段映射自动生成 Redshift CREATE TABLE DDL
- [ ] DDL 包含 DISTKEY/SORTKEY
- [ ] 支持 DDL 预览和手动编辑
- [ ] 一键执行建表
- [ ] 检测目标表是否已存在
- [ ] 表已存在时支持跳过/重建/追加列

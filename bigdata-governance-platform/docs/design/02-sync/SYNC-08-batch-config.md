# SYNC-08 多表批量配置

> 优先级: P1 | 模块: 数据同步

## 1. 功能概述
选择多张表后，支持批量设置相同的目标配置（S3/Redshift）、调度策略、写入模式。字段映射使用智能默认值（同名同类型自动映射）。减少重复配置工作。

## 2. 用户故事
- 作为数据开发者，我需要同步 20 张表到 Redshift，它们的目标配置都一样，希望一次性配置而不是重复 20 次。

## 3. 交互设计
```
同步任务 Step 2 选表后:
┌──────────────────────────────────────────────┐
│ 已选择 5 张表:                                │
│ ☑ users  ☑ orders  ☑ products                │
│ ☑ categories  ☑ order_items                  │
│                                               │
│ 批量配置:                                     │
│ [统一配置所有表] [逐表配置]                    │
│                                               │
│ 统一配置模式:                                 │
│ 写入模式: [overwrite ▼] (应用到所有表)        │
│ 目标 Schema: [public ▼]                       │
│ 表名前缀: [ods_ ]                             │
│ DISTKEY: [各表主键(自动检测) ▼]               │
│ SORTKEY: [created_at(如果存在) ▼]             │
│ 调度: [0 2 * * * ▼]                          │
│                                               │
│ 字段映射: ● 自动(同名同类型) ○ 逐表配置       │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync/batch
Request: {
  datasourceId: "xxx",
  tables: ["users", "orders", "products"],
  commonConfig: {
    channel: "glue",
    syncMode: "full",
    writeMode: "overwrite",
    targetType: "both",
    tableNameMapping: { rule: "prefix", prefix: "ods_" },
    redshiftConfig: { schema: "public", distStyle: "auto" },
    s3Config: { bucket: "bgp-datalake-xxx", format: "parquet" },
    cronExpression: "0 2 * * *"
  },
  fieldMappingMode: "auto"
}
Response: {
  created: 3,
  tasks: [{ taskId: "xxx", name: "ods_users 同步", table: "users" }, ...]
}
```

## 5. 数据模型
无新增，批量创建多条 bgp-sync-tasks 记录。

## 6. 后端实现方案
```
1. 遍历 tables 列表
2. 对每张表:
   a. 获取源表 Schema (字段列表)
   b. 自动生成字段映射 (同名同类型)
   c. 自动检测主键作为 DISTKEY
   d. 应用 commonConfig
   e. 创建 bgp-sync-tasks 记录
3. 批量创建 Glue Job (或复用同一个参数化 Job)
4. 返回创建结果
```

## 7. AWS 服务依赖
- Glue, DynamoDB, S3

## 8. 安全考虑
- 批量操作限制最多 50 张表
- 每张表独立的任务 ID，可独立管理

## 9. 验收标准
- [ ] 选择多张表后可统一配置
- [ ] 字段映射自动生成（同名同类型）
- [ ] 主键自动检测作为 DISTKEY
- [ ] 批量创建的任务可独立编辑和管理
- [ ] 支持逐表覆盖统一配置

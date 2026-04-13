# SYNC-05 增量字段配置

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
增量同步时配置增量策略：时间戳增量（基于 updated_at 等时间字段）、自增 ID 增量（基于自增主键）、CDC 日志（基于 binlog/WAL）。自动管理水位线（watermark），每次同步后自动推进。

## 2. 用户故事
- 作为数据开发者，我希望配置增量同步时只需选择增量字段，系统自动管理水位线，不需要手动记录上次同步到哪里。
- 作为运维人员，我希望能查看和手动调整水位线，用于数据修复场景。

## 3. 交互设计
```
同步任务 Step 1 (syncMode=incremental 时显示):
┌──────────────────────────────────────────────┐
│ 增量策略:                                     │
│  ● 时间戳增量  ○ 自增ID增量  ○ CDC日志        │
│                                               │
│ 增量字段: [updated_at ▼] (从源表字段中选择)    │
│ 字段类型: DATETIME ✅                          │
│                                               │
│ 起始值:   [2026-01-01 00:00:00]               │
│           (首次同步的起始点，之后自动推进)       │
│                                               │
│ 水位线管理:                                    │
│ ┌──────────────────────────────────────────┐  │
│ │ 当前水位线: 2026-03-29 08:00:00          │  │
│ │ 上次同步:   03-29 02:00 → 03-29 08:00   │  │
│ │            (同步了 1,234 行)              │  │
│ │ [手动调整水位线] [重置到起始值]            │  │
│ └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync 增加 incrementalConfig:
{
  "incrementalConfig": {
    "strategy": "timestamp",
    "field": "updated_at",
    "fieldType": "datetime",
    "startValue": "2026-01-01 00:00:00"
  }
}

GET /api/sync/{id}/watermark
Response: {
  currentWatermark: "2026-03-29T08:00:00Z",
  lastSyncAt: "2026-03-29T02:00:00Z",
  lastSyncRows: 1234,
  history: [
    { syncAt: "2026-03-29T02:00:00Z", before: "2026-03-28T08:00:00Z", after: "2026-03-29T08:00:00Z", rows: 1234 },
    { syncAt: "2026-03-28T02:00:00Z", before: "2026-03-27T08:00:00Z", after: "2026-03-28T08:00:00Z", rows: 980 }
  ]
}

PUT /api/sync/{id}/watermark
Request: { watermark: "2026-03-01T00:00:00Z" }  (手动调整)
```

## 5. 数据模型
新增 DynamoDB 表 bgp-watermarks:
- PK: taskId
- SK: "current"
- watermark: String (当前水位线值)
- lastSyncAt: String
- lastSyncRows: Number
- history: List<Map> (最近 10 次水位线变更记录)

## 6. 后端实现方案
```
Glue PySpark 脚本中:
1. 读取水位线: 从 DynamoDB bgp-watermarks 获取 currentWatermark
2. 构建增量查询:
   时间戳: WHERE {field} > '{watermark}' ORDER BY {field}
   自增ID: WHERE {field} > {watermark} ORDER BY {field}
3. 执行同步
4. 获取本批次最大值: df.agg(max(field)).collect()[0][0]
5. 更新水位线: 写入新的 watermark 到 DynamoDB
6. 如果同步失败，不更新水位线（保证 at-least-once）

CDC 模式:
- 使用 DMS 通道，水位线由 DMS 自动管理（binlog position）
- 平台记录 DMS Task 的 checkpoint 信息
```

## 7. AWS 服务依赖
- DynamoDB (水位线存储)
- Glue (增量查询)
- DMS (CDC 模式)

## 8. 安全考虑
- 水位线手动调整需要 Admin/Developer 权限
- 水位线回退会导致数据重复同步，需二次确认
- 水位线变更记录到审计日志

## 9. 验收标准
- [ ] 支持时间戳增量和自增 ID 增量两种策略
- [ ] 增量字段从源表字段列表中选择
- [ ] 每次同步后水位线自动推进
- [ ] 同步失败时水位线不推进
- [ ] 支持查看水位线历史
- [ ] 支持手动调整水位线（需确认）
- [ ] CDC 模式使用 DMS 自动管理

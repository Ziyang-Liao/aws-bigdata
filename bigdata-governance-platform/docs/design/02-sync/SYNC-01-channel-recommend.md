# SYNC-01 通道自动推荐

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
根据源类型+目标类型+同步模式，自动推荐最优同步通道（Zero-ETL/Glue/DMS），并说明推荐原因和预估性能。

## 2. 用户故事
- 作为数据开发者，我不了解 Zero-ETL/Glue/DMS 的区别，希望系统自动推荐最合适的通道。

## 3. 交互设计
```
同步任务 Step 1 选择通道时:
┌──────────────────────────────────────────────┐
│ ⭐ 推荐: Glue ETL                            │
│   原因: 源类型 MySQL 全量同步到 S3+Redshift   │
│   预估: ~5分钟 (基于 8,000 行)                │
│                                               │
│ ○ Zero-ETL  ⚠️ 不支持 S3 目标                │
│ ● Glue ETL  ✅ 推荐                          │
│ ○ DMS CDC   适合持续增量场景                   │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync/recommend-channel
Request: { datasourceId, targetType, syncMode }
Response: {
  recommended: "glue",
  reason: "源类型 MySQL 全量同步到 S3+Redshift，Glue ETL 最适合",
  options: [
    { channel: "glue", supported: true, recommended: true, reason: "通用ETL，支持所有目标" },
    { channel: "zero-etl", supported: false, reason: "Zero-ETL 不支持 S3 目标" },
    { channel: "dms", supported: true, recommended: false, reason: "DMS 更适合 CDC 场景" }
  ]
}
```

## 5. 数据模型
无新增，纯逻辑计算。

## 6. 后端实现方案
```
推荐规则矩阵:
| 源类型          | 目标      | 模式     | 推荐通道   |
|----------------|-----------|---------|-----------|
| MySQL/Aurora   | Redshift  | 增量    | Zero-ETL  |
| MySQL/Aurora   | Redshift  | 全量    | Glue      |
| 任意 JDBC      | S3        | 全量    | Glue      |
| 任意 JDBC      | S3+RS     | 全量    | Glue      |
| MySQL/PG/Oracle| 任意      | CDC     | DMS       |
| 任意 JDBC      | 任意      | 全量    | Glue      |
```

## 7. AWS 服务依赖
无，纯逻辑。

## 8. 安全考虑
无特殊安全考虑。

## 9. 验收标准
- [ ] 选择数据源和目标后自动显示推荐通道
- [ ] 不支持的通道标记为灰色并说明原因
- [ ] 推荐原因清晰易懂

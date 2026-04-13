# SYNC-04 数据过滤条件 (WHERE)

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
支持在同步任务中配置 WHERE 条件过滤源数据。支持内置变量（${run_date}、${yesterday}、${run_hour}）、快捷条件按钮、SQL 表达式编辑器。过滤条件在 Glue PySpark 脚本中转换为 pushdown predicate，在源端执行过滤减少数据传输量。

## 2. 用户故事
- 作为数据开发者，我只需要同步最近 7 天的订单数据，不需要全量同步历史数据。
- 作为 ETL 工程师，我希望每次调度运行时自动过滤当天的数据，使用 ${run_date} 变量。

## 3. 交互设计
```
同步任务 Step 1 基本配置 → 数据过滤:
┌──────────────────────────────────────────────┐
│ 数据过滤 (WHERE):                             │
│                                               │
│ 快捷条件:                                     │
│ [最近N天] [指定日期范围] [指定字段值] [自定义]  │
│                                               │
│ ┌──────────────────────────────────────────┐  │
│ │ created_at >= '${run_date}' - INTERVAL   │  │
│ │ 7 DAY AND status = 'completed'           │  │
│ └──────────────────────────────────────────┘  │
│                                               │
│ 可用变量:                                     │
│ ${run_date}  → 2026-03-29 (运行日期)          │
│ ${yesterday} → 2026-03-28 (前一天)            │
│ ${run_hour}  → 2026-03-29 14 (运行小时)       │
│ ${run_ts}    → 2026-03-29 14:00:00 (运行时间) │
│                                               │
│ [预览过滤结果: 约 1,234 行]                    │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync 增加 whereClause:
{
  "whereClause": "created_at >= '${run_date}' - INTERVAL 7 DAY AND status = 'completed'",
  "whereVariables": {
    "run_date": "auto",
    "custom_var": "2026-01-01"
  }
}

POST /api/sync/{id}/preview-filter
Request: { whereClause: "...", limit: 10 }
Response: { estimatedRows: 1234, sampleRows: [...] }
```

## 5. 数据模型
bgp-sync-tasks 新增:
- whereClause: String (WHERE 条件表达式)
- whereVariables: Map (自定义变量值)

## 6. 后端实现方案
```
1. 变量替换:
   运行时将 ${run_date} 替换为实际日期
   替换逻辑在 Glue Job 启动前执行
   
2. Glue PySpark 脚本中:
   # Pushdown predicate (在源端过滤)
   df = spark.read.jdbc(url, table, properties=props,
     predicates=[resolved_where_clause])
   
   # 或 DataFrame filter
   df = df.filter(resolved_where_clause)

3. 过滤预览:
   执行 SELECT COUNT(*) FROM table WHERE {clause} LIMIT 1
   通过 Glue Connection 临时查询

4. 快捷条件生成:
   "最近N天" → "created_at >= CURRENT_DATE - INTERVAL {N} DAY"
   "指定日期范围" → "created_at BETWEEN '{start}' AND '{end}'"
   "指定字段值" → "{field} = '{value}'"
```

## 7. AWS 服务依赖
- Glue (PySpark pushdown predicate)

## 8. 安全考虑
- WHERE 条件 SQL 注入防护：仅允许 SELECT 相关语法，禁止 DROP/DELETE/UPDATE
- 变量值转义处理
- 预览查询添加 LIMIT 保护

## 9. 验收标准
- [ ] 支持自定义 WHERE 条件
- [ ] 支持 ${run_date}/${yesterday}/${run_hour} 变量
- [ ] 快捷条件按钮可生成常用过滤
- [ ] 过滤预览显示预估行数
- [ ] Glue Job 中正确应用过滤条件
- [ ] 变量在运行时正确替换

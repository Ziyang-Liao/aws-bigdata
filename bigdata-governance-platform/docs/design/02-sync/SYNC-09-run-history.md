# SYNC-09 运行历史与统计

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
记录每次同步任务运行的详细信息：开始/结束时间、读取/写入行数、字节数、耗时、状态、错误信息。提供 API 查询和前端趋势图表展示。

## 2. 用户故事
- 作为数据开发者，我希望查看每次同步的运行结果，了解同步了多少数据、耗时多久。
- 作为运维人员，我希望看到同步任务的历史趋势，发现性能退化或数据量异常。

## 3. 交互设计
```
任务详情页 → 运行历史 Tab:
┌──────────────────────────────────────────────┐
│ 运行历史                          [刷新]      │
│                                               │
│ #  开始时间          耗时    读取    写入  状态 │
│ 5  03-29 02:00:05   3m12s  8,234  8,234  ✅  │
│ 4  03-28 02:00:03   3m08s  8,100  8,100  ✅  │
│ 3  03-27 02:00:04   3m15s  7,980  7,980  ✅  │
│ 2  03-26 02:00:02   0m45s  0      0      ❌  │
│    └ 错误: Connection refused                 │
│ 1  03-25 02:00:01   3m05s  7,800  7,800  ✅  │
│                                               │
│ 趋势图 (最近 30 天):                          │
│ ┌──────────────────────────────────────────┐  │
│ │ 📊 同步行数  📈 耗时  ✅ 成功率          │  │
│ │ [折线图]                                 │  │
│ └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/sync/{id}/runs?limit=20&offset=0
Response: {
  runs: [{
    runId: "xxx",
    status: "succeeded",
    startedAt: "2026-03-29T02:00:05Z",
    finishedAt: "2026-03-29T02:03:17Z",
    duration: 192,
    metrics: { rowsRead: 8234, rowsWritten: 8234, bytesRead: 1048576, bytesWritten: 524288 },
    triggeredBy: "schedule",
    glueJobRunId: "jr_xxx",
    error: null
  }],
  total: 5,
  stats: {
    successRate: 0.8,
    avgDuration: 185,
    totalRowsSynced: 32114
  }
}
```

## 5. 数据模型
新增 DynamoDB 表 bgp-task-runs:
- PK: taskId (String)
- SK: runId (ULID, 按时间排序)
- taskType: "sync" | "workflow"
- status: "running" | "succeeded" | "failed" | "cancelled"
- startedAt: String (ISO)
- finishedAt: String (ISO)
- duration: Number (秒)
- metrics: Map { rowsRead, rowsWritten, bytesRead, bytesWritten, errorCount }
- triggeredBy: "schedule" | "manual" | "dependency"
- glueJobRunId: String
- error: String
- TTL: finishedAt + 90天 (自动清理)

## 6. 后端实现方案
```
记录时机:
1. 任务启动时: 创建 run 记录, status=running
2. Glue Job 完成回调 (CloudWatch Events):
   - 成功: 更新 status=succeeded, metrics (从 Glue GetJobRun 获取)
   - 失败: 更新 status=failed, error
3. 或: 轮询 Glue GetJobRun 直到完成

Metrics 获取:
- Glue Job Metrics: ExecutionTime, DPUSeconds
- 行数统计: Glue Job 脚本中 print 到日志, 或写入 CloudWatch Custom Metrics
- 更精确: Glue Job 脚本结束前写入 DynamoDB

趋势统计:
- Query bgp-task-runs WHERE taskId={id} 最近 30 天
- 聚合计算 successRate, avgDuration
```

## 7. AWS 服务依赖
- DynamoDB (运行记录存储)
- Glue (GetJobRun 获取运行结果)
- CloudWatch Events (Job 完成回调)

## 8. 安全考虑
- 运行记录 90 天自动清理 (DynamoDB TTL)
- 错误信息中不包含密码等敏感信息
- 运行记录只读，不可修改

## 9. 验收标准
- [ ] 每次运行自动记录到 DynamoDB
- [ ] 记录包含行数、字节数、耗时、状态
- [ ] 失败时记录错误信息
- [ ] API 支持分页查询运行历史
- [ ] 前端显示运行历史表格和趋势图
- [ ] 90 天自动清理历史记录

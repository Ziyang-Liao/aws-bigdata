# DS-17 数据源使用统计

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
显示该数据源被多少同步任务引用、最近同步时间、累计同步行数。

## 2. 用户故事
- 作为管理员，我希望知道哪些数据源在被使用、使用频率如何，以便评估资源分配和清理不再使用的数据源。

## 3. 交互设计
```
数据源列表新增列:
引用任务 | 最近同步 | 累计行数
  3 个   | 2小时前  | 128,456
```

## 4. API 设计
```
GET /api/datasources/{id}/stats
Response: {
  taskCount: 3,
  tasks: [{ taskId: "xxx", name: "用户表同步", lastRunAt: "..." }],
  lastSyncAt: "2026-03-29T09:00:00Z",
  totalRowsSynced: 128456
}
```

## 5. 数据模型
从 bgp-sync-tasks 表按 datasourceId 查询聚合，无新增表。

## 6. 后端实现方案
```
1. Query bgp-sync-tasks WHERE datasourceId = {id}
2. 统计任务数量
3. 从 bgp-task-runs 聚合最近同步时间和累计行数
```

## 7. AWS 服务依赖
- DynamoDB (Query)

## 8. 安全考虑
- 只读统计，无安全风险

## 9. 验收标准
- [ ] 数据源列表显示引用任务数
- [ ] 详情页显示关联的同步任务列表
- [ ] 显示最近同步时间和累计行数

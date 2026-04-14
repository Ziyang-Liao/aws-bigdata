# DS-18 操作审计日志

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
记录所有数据源操作：创建、修改、删除、测试连接。存储到 DynamoDB 审计表，支持查询和过滤。

## 2. 用户故事
- 作为安全管理员，我希望追踪谁在什么时间修改了数据源配置，以满足审计合规要求。

## 3. 交互设计
```
审计日志页面 (/audit):
┌──────────────────────────────────────────────────┐
│ [资源类型: 数据源▼] [操作: 全部▼] [时间: 最近7天▼] │
│                                                   │
│ 时间              用户      操作    资源           │
│ 03-29 11:36:00   admin    创建    业务主库-MySQL   │
│ 03-29 11:35:00   admin    测试    业务主库-MySQL   │
│ 03-28 15:00:00   li_si    修改    数仓-PG         │
│   变更: host 从 old.com → new.com                 │
│ 03-28 14:00:00   admin    删除    测试库           │
└──────────────────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/audit-logs?resourceType=datasource&action=create&startTime=2026-03-28&limit=50
Response: {
  logs: [{
    logId: "xxx",
    userId: "admin",
    action: "create",
    resourceType: "datasource",
    resourceId: "01KMWQT7ZB",
    resourceName: "业务主库-MySQL",
    timestamp: "2026-03-29T11:36:00Z",
    details: { name: "业务主库-MySQL", type: "mysql", host: "bgp-source-mysql.xxx" }
  }],
  nextToken: "xxx"
}
```

## 5. 数据模型
新增 DynamoDB 表 bgp-audit-logs:
- PK: resourceType#resourceId (如 "datasource#01KMWQT7ZB")
- SK: timestamp#logId
- GSI: userId-index (PK: userId, SK: timestamp) 按用户查询
- Attributes: userId, action, resourceType, resourceId, resourceName, timestamp, details, ip

## 6. 后端实现方案
```
1. 创建审计中间件 auditLog(action, resourceType, resourceId, details)
2. 在每个 API handler 的成功路径中调用
3. 异步写入 DynamoDB (不阻塞主流程)
4. details 存储变更前后的 diff (修改操作)
```

## 7. AWS 服务依赖
- DynamoDB (新表 bgp-audit-logs)

## 8. 安全考虑
- 审计日志不可修改/删除 (仅 append)
- 日志中不记录密码等敏感字段
- 保留期限: 90 天 (DynamoDB TTL)

## 9. 验收标准
- [ ] 所有数据源 CRUD 操作自动记录审计日志
- [ ] 支持按资源类型、操作类型、时间范围过滤
- [ ] 修改操作记录变更前后的 diff
- [ ] 审计日志页面可查看和搜索

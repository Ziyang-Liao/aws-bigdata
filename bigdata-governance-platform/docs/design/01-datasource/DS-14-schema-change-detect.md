# DS-14 Schema 变更检测

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
定期对比源表 Schema 与上次快照，检测字段新增/删除/类型变更，通知用户并显示 diff 视图。

## 2. 用户故事
- 作为数据开发者，我希望源表结构变更时收到通知，以便及时调整同步任务的字段映射。

## 3. 交互设计
```
数据源列表中出现告警图标:
⚠️ 业务主库-MySQL  |  Schema 变更: users 表新增 2 个字段

点击查看 diff:
┌──────────────────────────────────────┐
│ users 表 Schema 变更                  │
│                                       │
│ + phone VARCHAR(20)     [新增]        │
│ + avatar_url TEXT        [新增]        │
│ ~ email VARCHAR(100→200) [类型变更]    │
│                                       │
│ [忽略] [更新同步任务映射]              │
└──────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/datasources/{id}/schema-changes
Response: {
  hasChanges: true,
  changes: [{
    table: "users",
    added: [{ name: "phone", type: "VARCHAR(20)" }],
    removed: [],
    modified: [{ name: "email", oldType: "VARCHAR(100)", newType: "VARCHAR(200)" }]
  }]
}
```

## 5. 数据模型
bgp-schema-snapshots:
- PK: datasourceId, SK: database#tableName
- columns: List<{ name, type }>
- snapshotAt: ISO timestamp

## 6. 后端实现方案
```
1. EventBridge 定时触发 (每天一次)
2. Lambda 获取当前 Schema
3. 对比 DynamoDB 中的上次快照
4. 有变更 → 写入变更记录 + 发送通知
5. 更新快照
```

## 7. AWS 服务依赖
- EventBridge, Lambda, DynamoDB, SNS (通知)

## 8. 安全考虑
- 只读操作，不修改源库
- 变更通知不包含数据内容

## 9. 验收标准
- [ ] 每天自动检测 Schema 变更
- [ ] 检测到变更时在列表页显示告警
- [ ] 支持查看 diff 视图（新增/删除/修改）
- [ ] 支持一键更新同步任务字段映射

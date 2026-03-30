# DS-12 数据预览

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
在元数据浏览中支持预览表数据（前 10/50/100 行），帮助用户确认数据内容和格式。

## 2. 用户故事
- 作为数据开发者，我希望在配置同步任务前能预览源表数据，以确认数据格式和内容是否符合预期。

## 3. 交互设计
```
元数据浏览 Drawer → 表展开后:
┌──────────────────────────────────────┐
│ 📋 users (5 字段)                     │
│ [字段列表] [数据预览]                  │
│                                       │
│ 显示行数: [10▼]  [刷新]               │
│ ┌────────┬──────────┬───────────────┐ │
│ │user_id │ username │ email         │ │
│ ├────────┼──────────┼───────────────┤ │
│ │ 1      │ zhang_san│ zhang@ex.com  │ │
│ │ 2      │ li_si    │ li@ex.com     │ │
│ │ ...    │          │               │ │
│ └────────┴──────────┴───────────────┘ │
└──────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/datasources/{id}/preview?table=users&database=ecommerce&limit=10
Response: {
  columns: ["user_id", "username", "email", "user_level", "created_at"],
  rows: [[1, "zhang_san", "zhang@ex.com", "vip", "2026-03-29"], ...],
  totalRows: 8,
  truncated: false
}
```

## 5. 数据模型
无新增数据模型，实时查询。

## 6. 后端实现方案
```
1. 从 DynamoDB 获取数据源配置
2. 从 Secrets Manager 获取密码
3. 通过 Glue Connection 或创建临时 Glue Job (Python Shell) 执行:
   SELECT * FROM {table} LIMIT {limit}
4. 返回结果集
备选方案: 使用 Glue GetTable + Athena 查询 (如果数据已在 S3)
```

## 7. AWS 服务依赖
- Glue (Connection), Secrets Manager

## 8. 安全考虑
- limit 最大 1000，防止大量数据传输
- 敏感字段(password 等)自动脱敏显示
- 仅有数据源读权限的用户可预览

## 9. 验收标准
- [ ] 支持预览任意表的前 N 行数据
- [ ] 支持选择显示行数 (10/50/100)
- [ ] 数据以表格形式展示
- [ ] 查询超时 30 秒自动中止

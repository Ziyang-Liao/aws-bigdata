# DS-11 数据源权限控制

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
不同用户/角色只能看到授权的数据源。权限模型：owner(创建者)、sharedWith(共享用户列表)、角色(admin 看所有)。

## 2. 用户故事
- 作为管理员，我希望开发者只能看到分配给他们的数据源，以防止未授权访问生产库。

## 3. 交互设计
```
数据源详情 → 权限设置:
┌──────────────────────────────────────┐
│ 所有者: zhang_san                     │
│ 共享给:                               │
│   [li_si     ] [可编辑▼] [移除]       │
│   [wang_wu   ] [只读  ▼] [移除]       │
│   [+添加用户]                         │
└──────────────────────────────────────┘
```

## 4. API 设计
```
PUT /api/datasources/{id}/permissions
Request: { sharedWith: [{ userId: "li_si", permission: "edit" }, { userId: "wang_wu", permission: "read" }] }

GET /api/datasources 自动过滤:
- Admin: 返回所有
- Developer: 返回 owner=self OR sharedWith 包含 self
- Viewer: 返回 sharedWith 包含 self (只读)
```

## 5. 数据模型
bgp-datasources 新增:
- ownerId: String (创建者 userId)
- sharedWith: List<Map> [{ userId, permission: "read"|"edit" }]

## 6. 后端实现方案
```
1. API 中间件从 Cognito Token 获取 userId 和 role
2. GET /api/datasources:
   - Admin: Scan 全部
   - 其他: FilterExpression 过滤 ownerId=userId OR contains(sharedWith, userId)
3. PUT/DELETE: 检查 ownerId=userId OR role=admin
4. 权限变更记录到审计日志
```

## 7. AWS 服务依赖
- Cognito (Token 解析)
- DynamoDB (FilterExpression)

## 8. 安全考虑
- API 层强制权限检查，不依赖前端隐藏
- 共享权限最小化：默认只读
- 删除操作仅 owner 和 admin 可执行

## 9. 验收标准
- [ ] 普通用户只能看到自己创建的和被共享的数据源
- [ ] Admin 可看到所有数据源
- [ ] 支持共享给指定用户（只读/可编辑）
- [ ] 未授权访问返回 403

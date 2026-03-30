# AUTH-03 用户管理页面

> 优先级: P0 | 模块: 用户权限

## 1. 功能概述
管理员创建/禁用用户、分配角色。调用Cognito AdminCreateUser/AdminAddUserToGroup等API。用户列表+角色管理。

## 2. 用户故事
- 作为管理员，我希望平台提供该功能，以便安全地管理用户和权限。

## 3. 交互设计
详见功能概述。

## 4. API 设计
遵循 /api/auth 路由规范。

## 5. 数据模型
Cognito User Pool Groups + DynamoDB 审计表。

## 6. 后端实现方案
基于 Cognito + JWT 中间件实现。

## 7. AWS 服务依赖
Cognito, DynamoDB。

## 8. 安全考虑
JWT验证、RBAC强制执行、密码策略、Session管理。

## 9. 验收标准
- [ ] 功能按设计实现
- [ ] 权限控制严格有效

# AUTH-01 真实用户身份

> 优先级: P0 | 模块: 用户权限

## 1. 功能概述
API 从 Cognito JWT Token 获取真实 userId，替换硬编码的 default-user。中间件解析 Authorization header 中的 Bearer Token，提取 sub（用户ID）、cognito:username、cognito:groups。所有 DynamoDB 操作使用真实 userId 作为 PK。前端：登录后将 Token 存入 localStorage，每次 API 请求在 header 中携带。Token 过期自动刷新（Cognito RefreshToken）。后端：Next.js middleware 或 API Route 中间件，验证 JWT 签名（使用 Cognito JWKS），提取用户信息注入 request context。未登录或 Token 无效返回 401。

## 2. 用户故事
- 作为平台用户，我希望平台提供该功能，以便高效完成日常数据开发和运维工作。

## 3. 交互设计
详见功能概述中的前端描述。基于 Ant Design + Next.js 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 RESTful 规范。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。

## 7. AWS 服务依赖
根据功能涉及的 AWS 服务（详见功能概述）。

## 8. 安全考虑
- 遵循最小权限原则
- 敏感数据加密存储和传输
- 操作权限控制
- 输入校验防注入

## 9. 验收标准
- [ ] 功能按设计实现并通过端到端测试
- [ ] 前端交互流畅，错误提示清晰
- [ ] API 返回格式规范
- [ ] 与现有功能无冲突

# PLT-05 服务状态检查

> 优先级: P1 | 模块: 平台基础

## 1. 功能概述
检查各 AWS 服务连接状态：DynamoDB（ListTables）、Redshift（DescribeWorkgroup）、Glue（GetConnections）、S3（HeadBucket）、Cognito（DescribeUserPool）、MWAA（GetEnvironment）。前端：系统设置页和首页 Dashboard 展示服务状态卡片。绿色✅=正常，黄色⚠️=降级，红色❌=不可用。后端：GET /api/health 并行检查所有服务，返回各服务状态。超时 5 秒视为不可用。

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

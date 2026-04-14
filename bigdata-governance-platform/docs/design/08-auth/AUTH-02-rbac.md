# AUTH-02 RBAC 权限模型

> 优先级: P0 | 模块: 用户权限

## 1. 功能概述
三种角色：Admin（所有权限+用户管理+系统设置）、Developer（数据源/同步/工作流/Redshift 全部操作权限）、Viewer（所有模块只读，不能创建/编辑/删除/执行）。实现：Cognito User Pool Groups（bgp-admin/bgp-developer/bgp-viewer）。API 中间件根据 groups 检查操作权限。前端根据角色隐藏/禁用操作按钮。权限矩阵：Admin=全部, Developer=CRUD+执行(仅自己的资源), Viewer=只读。后端：创建 checkPermission(userId, role, action, resource) 中间件，在每个 API handler 中调用。

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

# GOV-02 数据血缘自动生成

> 优先级: P0 | 模块: 数据治理

## 1. 功能概述
根据同步任务配置自动生成表级和列级血缘。数据来源：1)同步任务的源表→目标表映射 2)字段映射的源字段→目标字段映射 3)SQL节点中的 FROM/JOIN/INSERT INTO 解析。存储：DynamoDB bgp-lineage 表（PK: targetFqn 如 redshift.dev.public.users, SK: sourceFqn 如 mysql.ecommerce.users）。字段：lineageType(sync/sql), columnMappings[{source,target}], taskId, createdAt。后端：同步任务创建/更新时自动生成血缘记录。SQL 血缘使用简单正则解析 FROM/JOIN/INSERT INTO 提取表名。

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

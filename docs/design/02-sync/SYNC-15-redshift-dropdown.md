# SYNC-15 Redshift 下拉选择

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
同步目标配置中 Workgroup/Database/Schema 从 API 动态获取，级联选择。选 Workgroup → 加载 Database 列表 → 选 Database → 加载 Schema 列表。复用现有 /api/redshift/connections、/api/redshift/databases、/api/redshift/schemas API。前端：三个级联 Select 组件，选择后自动加载下一级。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便高效可靠地完成数据同步。

## 3. 交互设计
详见功能概述中的前端描述。具体 UI 组件使用 Ant Design 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 RESTful 规范，JSON 格式。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。基于 Glue ETL + DynamoDB 实现。

## 7. AWS 服务依赖
- Glue (ETL Job)
- DynamoDB (配置/状态存储)
- S3 (数据存储)
- SNS (通知，如适用)
- Redshift Data API (如适用)

## 8. 安全考虑
- 遵循最小权限原则
- 敏感数据脱敏处理
- 操作记录审计日志

## 9. 验收标准
- [ ] 功能按设计实现并通过端到端测试
- [ ] 前端交互流畅，错误提示清晰
- [ ] API 返回格式规范，错误码明确
- [ ] 与现有功能无冲突

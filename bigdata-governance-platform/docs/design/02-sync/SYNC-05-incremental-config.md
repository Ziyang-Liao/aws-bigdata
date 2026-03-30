# SYNC-05 增量字段配置

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
增量同步时指定增量字段(updated_at/自增ID)、增量起始值、水位线自动管理。DynamoDB 存储水位线: bgp-watermarks 表(PK:taskId, watermark:String, lastSyncAt)。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便高效完成数据同步配置和运维。

## 3. 交互设计
详见功能概述中的描述，具体 UI 原型在开发阶段细化。

## 4. API 设计
根据功能需求设计对应的 RESTful API，遵循现有 /api/sync 路由规范。

## 5. 数据模型
根据功能需求扩展 bgp-sync-tasks 表或新增辅助表。

## 6. 后端实现方案
基于现有 Glue ETL / Zero-ETL / DMS 引擎实现，详细方案在开发阶段细化。

## 7. AWS 服务依赖
Glue, S3, Redshift Data API, DynamoDB, 根据功能可能涉及 SNS/EventBridge。

## 8. 安全考虑
遵循最小权限原则，敏感数据脱敏处理。

## 9. 验收标准
- [ ] 功能按设计实现并通过测试
- [ ] 前端交互流畅，错误提示清晰
- [ ] API 返回格式规范

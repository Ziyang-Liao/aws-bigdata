# GOV-01 数据目录自动采集

> 优先级: P0 | 模块: 数据治理

## 1. 功能概述
自动从 Glue Data Catalog 和 Redshift 采集表元数据（表名、字段、类型、注释、行数），在平台内统一展示。支持定时采集（每天）和手动触发。前端：数据目录页面，搜索框+表列表+表详情（字段/统计/标签）。后端：GET /api/governance/catalog?keyword=users。采集逻辑：调 Glue GetTables 获取 Data Catalog 中的表 + 调 Redshift information_schema 获取 Redshift 表。合并去重后存入 DynamoDB bgp-data-catalog 表。EventBridge 每天触发 Lambda 执行采集。

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

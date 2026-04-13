# WF-06 版本管理

> 优先级: P1 | 模块: ETL编排

## 1. 功能概述
每次发布到 Airflow 时生成版本号（v1/v2/v3...）。支持查看历史版本列表、对比两个版本的差异（节点增删、连线变化、参数变更）、回滚到指定版本。前端：版本列表面板，每个版本显示发布时间/发布者/变更摘要。对比视图：左右两栏 DAG 图对比。后端：DynamoDB 新表 bgp-workflow-versions（PK: workflowId, SK: version），存储 dagDefinition 快照。发布时自动创建版本记录。回滚时将历史版本的 dagDefinition 覆盖到当前。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便高效编排和管理复杂的 ETL 工作流。

## 3. 交互设计
详见功能概述中的前端描述。基于 ReactFlow + Ant Design 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 /api/workflow 路由规范。

## 5. 数据模型
详见功能概述中的数据模型描述。扩展 bgp-workflows 表或新增辅助表。

## 6. 后端实现方案
详见功能概述中的后端描述。基于 MWAA Airflow REST API + DynamoDB 实现。

## 7. AWS 服务依赖
- MWAA (Airflow REST API)
- S3 (DAG 文件存储)
- CloudWatch Logs (节点日志)
- DynamoDB (版本/运行记录)

## 8. 安全考虑
- 工作流执行权限控制（仅 owner 和 admin 可发布/触发）
- 日志中过滤敏感信息（密码、密钥）
- 版本回滚需要确认，防止误操作

## 9. 验收标准
- [ ] 功能按设计实现并通过端到端测试
- [ ] DAG 编辑器交互流畅
- [ ] 与 Airflow 集成正常
- [ ] 错误处理和提示完善

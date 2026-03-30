# SCH-03 依赖调度

> 优先级: P0 | 模块: 调度管理

## 1. 功能概述
配置任务间依赖关系：上游任务完成后自动触发下游。支持多上游 AND/OR 逻辑（AND：所有上游完成才触发，OR：任一上游完成即触发）。可视化依赖图。前端：依赖配置面板，选择上游任务+逻辑关系。依赖图使用 ReactFlow 展示。后端：DynamoDB bgp-sync-tasks 增加 dependencies 字段 [{taskId, logic: 'and'|'or'}]。任务完成时检查下游依赖是否满足，满足则自动触发。Airflow DAG 中通过 ExternalTaskSensor 实现跨 DAG 依赖。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便灵活配置和管理任务调度。

## 3. 交互设计
详见功能概述中的前端描述。

## 4. API 设计
详见功能概述中的 API 描述。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。基于 MWAA Airflow + EventBridge 实现。

## 7. AWS 服务依赖
- MWAA (Airflow)
- EventBridge (定时/事件触发)
- Lambda (事件处理)
- DynamoDB (配置存储)
- S3 (DAG 文件)

## 8. 安全考虑
- Webhook Token 加密存储，定期轮换
- 补数据操作需要 Admin/Developer 权限
- 事件触发需要验证来源合法性

## 9. 验收标准
- [ ] 功能按设计实现并通过测试
- [ ] 调度配置直观易用
- [ ] 与 Airflow 集成正常

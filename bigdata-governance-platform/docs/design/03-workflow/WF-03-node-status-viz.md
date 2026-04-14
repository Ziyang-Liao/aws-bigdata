# WF-03 节点运行状态可视化

> 优先级: P0 | 模块: ETL编排

## 1. 功能概述
DAG 图上实时显示每个节点的运行状态：等待中（灰色）、运行中（蓝色+旋转动画）、成功（绿色+✅）、失败（红色+❌）、跳过（黄色）。节点上显示耗时和处理行数。前端：运行模式下轮询 /api/workflow/{id}/runs/{runId}/nodes 获取各节点状态，更新 ReactFlow 节点样式。节点 border 颜色和背景色根据状态变化。运行中节点显示 Spin 动画。后端：从 Airflow REST API 获取 DAG Run 的 Task Instance 状态，映射到节点 ID。

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

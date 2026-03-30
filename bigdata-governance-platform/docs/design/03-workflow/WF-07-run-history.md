# WF-07 运行历史

> 优先级: P0 | 模块: ETL编排

## 1. 功能概述
工作流运行历史列表：每次运行的整体状态、总耗时、各节点执行情况（成功/失败/跳过数量）。支持查看单次运行的详细甘特图（每个节点的开始/结束时间条形图）。前端：运行历史表格+甘特图视图切换。点击某次运行展开节点级详情。后端：GET /api/workflow/{id}/runs 返回运行列表，GET /api/workflow/{id}/runs/{runId} 返回单次运行详情（含各节点状态/耗时）。数据来源：Airflow REST API GET /dags/{dagId}/dagRuns + /taskInstances。

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

# WF-04 节点日志查看

> 优先级: P0 | 模块: ETL编排

## 1. 功能概述
点击运行中/已完成的节点直接查看该节点的运行日志。日志面板支持实时滚动（运行中时自动追加）、关键字搜索高亮、级别过滤（INFO/WARN/ERROR）。前端：点击节点弹出右侧日志面板（Drawer），终端风格黑底绿字。运行中时 WebSocket/轮询实时追加日志。后端：GET /api/workflow/{id}/runs/{runId}/nodes/{nodeId}/logs，从 CloudWatch Logs 获取对应 Airflow Task 的日志。支持 startTime/endTime 参数分页。

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

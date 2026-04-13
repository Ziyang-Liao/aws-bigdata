# WF-08 重跑失败节点

> 优先级: P1 | 模块: ETL编排

## 1. 功能概述
工作流部分失败时，支持从失败节点开始重跑，已成功的节点跳过。减少重复计算，加快恢复速度。前端：运行详情中失败节点显示"重跑"按钮，点击后确认对话框说明将从哪个节点开始重跑。后端：调 Airflow REST API POST /dags/{dagId}/dagRuns/{runId}/taskInstances/{taskId}/clear 清除失败节点状态，Airflow 自动重新调度。或创建新的 DAG Run 并标记已完成节点为 success。

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

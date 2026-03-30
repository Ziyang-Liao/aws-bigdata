# WF-02 节点参数化

> 优先级: P1 | 模块: ETL编排

## 1. 功能概述
支持全局变量（${run_date}/${run_hour}/${workflow_name}）和节点间参数传递（上游节点输出 → 下游节点输入）。运行时参数覆盖（手动触发时可传入自定义参数）。前端：工作流配置中增加"全局变量"面板，节点配置中增加"输入参数"和"输出参数"。后端：Airflow DAG 中使用 XCom 实现节点间传参，全局变量通过 DAG params 传递。变量在 SQL/Python 脚本中用 ${var_name} 引用，运行时替换。

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

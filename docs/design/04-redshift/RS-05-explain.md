# RS-05 执行计划 (EXPLAIN)

> 优先级: P1 | 模块: Redshift查询

## 1. 功能概述
一键查看 SQL 执行计划。在 SQL 前自动添加 EXPLAIN 执行，解析返回的执行计划树。高亮显示全表扫描、大数据量 Join、排序操作等性能瓶颈。前端："执行计划"按钮（在"执行"按钮旁边），结果以树形结构或表格展示。标红性能问题节点。后端：执行 EXPLAIN {sql}，解析结果返回结构化数据。

## 2. 用户故事
- 作为数据分析师，我希望平台提供该功能，以便高效编写和执行 Redshift SQL 查询。

## 3. 交互设计
详见功能概述中的前端描述。基于 Monaco Editor + Ant Design 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 /api/redshift 路由规范。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。基于 Redshift Data API 实现。

## 7. AWS 服务依赖
- Redshift Data API (ExecuteStatement, CancelStatement, GetStatementResult)
- Redshift Serverless
- S3 (大数据量导出)
- DynamoDB (执行历史)

## 8. 安全考虑
- SQL 注入防护（参数化查询）
- 查询资源限制（超时、最大返回行数）
- 敏感数据列自动脱敏（可配置）
- 执行历史中 SQL 不包含密码

## 9. 验收标准
- [ ] 功能按设计实现
- [ ] SQL 编辑器体验流畅
- [ ] 与 Redshift Data API 集成正常

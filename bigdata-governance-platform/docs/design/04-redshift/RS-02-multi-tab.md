# RS-02 多 Tab 编辑

> 优先级: P1 | 模块: Redshift查询

## 1. 功能概述
支持同时打开多个 SQL 编辑 Tab，每个 Tab 独立的 SQL 内容、执行状态、查询结果。Tab 可关闭、重命名、拖拽排序。新建 Tab 快捷键 Ctrl+T。前端：使用 Ant Design Tabs 组件，每个 Tab 包含独立的 MonacoEditor + 结果区域。Tab 状态存储在 React state 中（不持久化）。最多同时打开 10 个 Tab。

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

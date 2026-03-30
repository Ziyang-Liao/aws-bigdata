# RS-03 执行历史

> 优先级: P0 | 模块: Redshift查询

## 1. 功能概述
记录每次 SQL 执行：SQL 文本、执行时间、耗时、返回行数、状态（成功/失败）。DynamoDB 表 bgp-sql-history（PK: userId, SK: timestamp）。前端：执行历史面板（侧边或底部 Tab），点击历史记录可重新加载 SQL 到编辑器。支持搜索历史 SQL。后端：每次执行 SQL 时自动记录。保留最近 500 条。API: GET /api/redshift/history?limit=50。

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

# RS-01 SQL 自动补全

> 优先级: P1 | 模块: Redshift查询

## 1. 功能概述
基于已加载的 Schema 信息（表名、字段名、函数名）实现 SQL 自动补全。使用 Monaco Editor 的 registerCompletionItemProvider API。补全触发：输入 . 后补全字段名，输入 FROM/JOIN 后补全表名，输入 SELECT 后补全字段名。补全数据来源：/api/redshift/schemas 返回的 tables + columns。前端：加载 Schema 后将表/字段信息注册到 Monaco CompletionItemProvider。支持模糊匹配。补全项显示类型图标（表📋/字段📊/函数ƒ）。

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

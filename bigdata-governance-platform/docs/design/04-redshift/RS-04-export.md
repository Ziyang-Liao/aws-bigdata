# RS-04 结果导出

> 优先级: P1 | 模块: Redshift查询

## 1. 功能概述
导出查询结果为 CSV 或 Excel 文件。小数据量（<10000行）前端直接生成下载。大数据量通过 Redshift UNLOAD 到 S3 后生成预签名 URL 下载。前端：结果表格右上角"导出"按钮，选择格式（CSV/Excel）。后端：小数据量直接返回，大数据量调 UNLOAD 命令写入 S3，返回预签名下载 URL（有效期 1 小时）。

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

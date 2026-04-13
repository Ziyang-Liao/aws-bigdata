# SYNC-13 Glue Job 参数透传

> 优先级: P1 | 模块: 数据同步

## 1. 功能概述
高级用户可配置 Glue Job 运行参数：Worker 数量（2-100）、Worker 类型（G.1X/G.2X/G.4X）、超时时间（分钟）、Spark 参数（spark.sql.shuffle.partitions 等）。前端：同步任务配置中增加"高级参数"折叠区域。后端：创建/更新 Glue Job 时应用参数，StartJobRun 时传递 Arguments。默认值：2 Workers, G.1X, 60分钟超时。API: 在 POST /api/sync 中增加 glueConfig 字段。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便高效可靠地完成数据同步。

## 3. 交互设计
详见功能概述中的前端描述。具体 UI 组件使用 Ant Design 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 RESTful 规范，JSON 格式。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。基于 Glue ETL + DynamoDB 实现。

## 7. AWS 服务依赖
- Glue (ETL Job)
- DynamoDB (配置/状态存储)
- S3 (数据存储)
- SNS (通知，如适用)
- Redshift Data API (如适用)

## 8. 安全考虑
- 遵循最小权限原则
- 敏感数据脱敏处理
- 操作记录审计日志

## 9. 验收标准
- [ ] 功能按设计实现并通过端到端测试
- [ ] 前端交互流畅，错误提示清晰
- [ ] API 返回格式规范，错误码明确
- [ ] 与现有功能无冲突

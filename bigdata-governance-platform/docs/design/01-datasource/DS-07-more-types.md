# DS-07 更多数据源类型支持

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
新增 Aurora MySQL/PG、MongoDB(DocumentDB)、DynamoDB、Kafka(MSK)、S3文件(CSV/JSON/Parquet)、Redshift 作为源。采用类型注册表模式便于扩展。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便提升数据源管理的效率和安全性。

## 3. 交互设计
见功能概述中的描述。

## 4. API 设计
```
每种类型定义:\n- connectionParams: 连接所需参数\n- testMethod: 测试连通性方式\n- metadataBrowse: 元数据浏览方式\n\n类型注册表:\naurora-mysql: 同 mysql, Glue Connection\naurora-pg: 同 postgresql, Glue Connection\nmongodb: host/port/authDB/replicaSet, DocumentDB Connection\ndynamodb: region/tableName, SDK 直连\nkafka: bootstrapServers/topic/securityProtocol, MSK Connection\ns3: bucket/prefix/format, S3 直接读取\nredshift: workgroup/database, Redshift Data API
```

## 5. 数据模型
DynamoDB bgp-datasources type 字段扩展枚举值\n新增 connectionParams: Map (存储各类型特有参数)

## 6. 后端实现方案
```
每种类型定义:\n- connectionParams: 连接所需参数\n- testMethod: 测试连通性方式\n- metadataBrowse: 元数据浏览方式\n\n类型注册表:\naurora-mysql: 同 mysql, Glue Connection\naurora-pg: 同 postgresql, Glue Connection\nmongodb: host/port/authDB/replicaSet, DocumentDB Connection\ndynamodb: region/tableName, SDK 直连\nkafka: bootstrapServers/topic/securityProtocol, MSK Connection\ns3: bucket/prefix/format, S3 直接读取\nredshift: workgroup/database, Redshift Data API
```

## 7. AWS 服务依赖
前端: 数据源类型选择卡片化，每种类型显示图标+说明+适用场景\n后端: DataSourceTypeRegistry 类，每种类型实现 test/browse/getJdbcUrl 接口

## 8. 安全考虑
Glue, DocumentDB, DynamoDB SDK, MSK, S3, Redshift Data API

## 9. 验收标准
- 不同类型使用不同的最小权限策略\nKafka 需要 MSK 安全组配置|[ ] 支持至少 8 种数据源类型\n[ ] 每种类型可测试连通性\n[ ] 每种类型可浏览元数据\n[ ] 类型注册表可扩展

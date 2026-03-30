# DS-07 更多数据源类型支持

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
扩展数据源类型支持：Aurora MySQL/PostgreSQL、MongoDB (DocumentDB)、DynamoDB、Kafka (MSK)、S3 文件 (CSV/JSON/Parquet)、Redshift 作为源。采用类型注册表模式，每种类型实现统一接口，便于后续扩展。

## 2. 用户故事
- 作为数据开发者，我的数据分布在多种存储中（RDS、DocumentDB、S3、Kafka），希望平台统一管理所有数据源。
- 作为架构师，我希望平台的数据源类型可扩展，未来能快速接入新的数据存储。

## 3. 交互设计
```
创建数据源 Step 1 类型选择（卡片式）:
┌──────────────────────────────────────────────┐
│ 关系型数据库                                   │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │ 🐬     │ │ 🐘     │ │ 🔶     │ │ 🔷     │ │
│ │ MySQL  │ │ PG     │ │ Oracle │ │ SQLSvr │ │
│ └────────┘ └────────┘ └────────┘ └────────┘ │
│ ┌────────┐ ┌────────┐                        │
│ │ 🌟     │ │ 🌟     │                        │
│ │ Aurora │ │ AuroraPG│                        │
│ │ MySQL  │ │        │                        │
│ └────────┘ └────────┘                        │
│                                               │
│ NoSQL / 流式                                   │
│ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │ 🍃     │ │ 📊     │ │ 📨     │             │
│ │MongoDB │ │DynamoDB│ │ Kafka  │             │
│ └────────┘ └────────┘ └────────┘             │
│                                               │
│ 文件 / 数据仓库                                │
│ ┌────────┐ ┌────────┐                        │
│ │ 📁     │ │ 🏢     │                        │
│ │ S3文件 │ │Redshift│                        │
│ └────────┘ └────────┘                        │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/datasource-types
Response: {
  types: [
    {
      type: "mysql", label: "MySQL", category: "rdb", icon: "🐬",
      connectionFields: [
        { name: "host", label: "主机", required: true },
        { name: "port", label: "端口", required: true, default: 3306 },
        { name: "database", label: "数据库", required: true },
        { name: "username", label: "用户名", required: true },
        { name: "password", label: "密码", required: true, secret: true }
      ],
      testMethod: "glue_connection",
      metadataBrowse: "jdbc"
    },
    {
      type: "dynamodb", label: "DynamoDB", category: "nosql", icon: "📊",
      connectionFields: [
        { name: "region", label: "区域", required: true, default: "us-east-1" },
        { name: "tableNamePrefix", label: "表名前缀", required: false }
      ],
      testMethod: "sdk_list_tables",
      metadataBrowse: "dynamodb_describe"
    },
    {
      type: "s3", label: "S3 文件", category: "file", icon: "📁",
      connectionFields: [
        { name: "bucket", label: "Bucket", required: true },
        { name: "prefix", label: "路径前缀", required: false },
        { name: "format", label: "文件格式", required: true, options: ["csv","json","parquet","orc"] },
        { name: "delimiter", label: "分隔符", required: false, default: "," }
      ],
      testMethod: "s3_head_object",
      metadataBrowse: "s3_list_infer_schema"
    },
    {
      type: "kafka", label: "Kafka (MSK)", category: "streaming", icon: "📨",
      connectionFields: [
        { name: "bootstrapServers", label: "Bootstrap Servers", required: true },
        { name: "topic", label: "Topic", required: false },
        { name: "securityProtocol", label: "安全协议", required: true, options: ["PLAINTEXT","SSL","SASL_SSL"] },
        { name: "saslMechanism", label: "SASL 机制", required: false, options: ["PLAIN","SCRAM-SHA-256","SCRAM-SHA-512"] }
      ],
      testMethod: "msk_describe_cluster",
      metadataBrowse: "kafka_list_topics"
    }
  ]
}
```

## 5. 数据模型
bgp-datasources.type 枚举扩展:
- 现有: mysql, postgresql, oracle, sqlserver
- 新增: aurora-mysql, aurora-pg, mongodb, dynamodb, kafka, s3, redshift
bgp-datasources 新增: connectionParams: Map (存储各类型特有参数)

## 6. 后端实现方案
```
类型注册表模式:
interface DataSourceTypeHandler {
  getJdbcUrl(params): string | null;
  testConnection(params): Promise<TestResult>;
  browseMetadata(params): Promise<TableMetadata[]>;
  getGlueConnectionType(): string;
}

class MySQLHandler implements DataSourceTypeHandler { ... }
class DynamoDBHandler implements DataSourceTypeHandler { ... }
class S3Handler implements DataSourceTypeHandler { ... }
class KafkaHandler implements DataSourceTypeHandler { ... }

const registry = new Map<string, DataSourceTypeHandler>();
registry.set("mysql", new MySQLHandler());
registry.set("dynamodb", new DynamoDBHandler());
...

各类型测试方法:
- JDBC 类 (mysql/pg/oracle/sqlserver/aurora): Glue TestConnection
- DynamoDB: SDK ListTables + DescribeTable
- S3: SDK HeadBucket + ListObjectsV2
- Kafka: MSK DescribeCluster 或 AdminClient listTopics
- Redshift: Redshift Data API ExecuteStatement("SELECT 1")

各类型元数据浏览:
- JDBC 类: SHOW DATABASES → SHOW TABLES → DESCRIBE TABLE
- DynamoDB: ListTables → DescribeTable (KeySchema + AttributeDefinitions)
- S3: ListObjectsV2 → 读取首个文件推断 Schema (Parquet header / CSV header)
- Kafka: ListTopics → 读取最新消息推断 Schema
- Redshift: information_schema.columns
```

## 7. AWS 服务依赖
- Glue (JDBC 类连接)
- DynamoDB SDK (DynamoDB 类型)
- S3 SDK (S3 类型)
- MSK / Kafka AdminClient (Kafka 类型)
- Redshift Data API (Redshift 类型)
- DocumentDB SDK (MongoDB 类型)

## 8. 安全考虑
- 每种类型使用最小权限 IAM 策略
- Kafka SASL 凭证存 Secrets Manager
- S3 类型仅允许访问指定 bucket（IAM 策略限定）
- DynamoDB 类型仅允许 DescribeTable/Scan（不允许写入）

## 9. 验收标准
- [ ] 支持至少 10 种数据源类型
- [ ] 每种类型有独立的连接参数表单
- [ ] 每种类型可测试连通性
- [ ] 每种类型可浏览元数据（表/字段）
- [ ] 类型注册表可扩展，新增类型不修改核心代码
- [ ] 前端类型选择卡片化，分类展示

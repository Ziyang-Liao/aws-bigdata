# DS-13 表行数与大小统计

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
显示每张表的行数、数据大小、最后更新时间。通过 SHOW TABLE STATUS 或 SELECT COUNT 采集，缓存到 DynamoDB。

## 2. 用户故事
- 作为数据开发者，我希望看到源表的数据量，以便评估同步任务的耗时和成本。

## 3. 交互设计
```
元数据浏览中每张表显示:
📋 users  |  8 行  |  16 KB  |  最后更新: 2026-03-29 11:36
📋 orders |  20 行 |  4.2 KB |  最后更新: 2026-03-29 11:36
```

## 4. API 设计
```
GET /api/datasources/{id}/tables?database=ecommerce&includeStats=true
Response 中每个 table 增加:
{ name: "users", rowCount: 8, dataSize: 16384, lastUpdated: "2026-03-29T11:36:00Z" }
```

## 5. 数据模型
DynamoDB 缓存表 bgp-table-stats:
- PK: datasourceId, SK: database#tableName
- rowCount, dataSize, lastUpdated, cachedAt
- TTL: cachedAt + 3600 (1小时过期)

## 6. 后端实现方案
```
1. 检查缓存是否存在且未过期
2. 缓存命中 → 直接返回
3. 缓存未命中 → 执行 SHOW TABLE STATUS FROM {database}
4. 解析结果: Rows, Data_length, Update_time
5. 写入缓存
```

## 7. AWS 服务依赖
- DynamoDB (缓存), Glue (查询源库)

## 8. 安全考虑
- SHOW TABLE STATUS 是只读操作，不影响源库
- 缓存 TTL 防止数据过期

## 9. 验收标准
- [ ] 元数据浏览中显示行数和大小
- [ ] 统计数据缓存 1 小时
- [ ] 缓存过期后自动刷新

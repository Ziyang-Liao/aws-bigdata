# DS-10 数据源分组与标签

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
标签系统：环境(dev/staging/prod)、业务线、自定义标签。列表页按标签过滤/搜索。

## 2. 用户故事
- 作为团队负责人，我希望按环境和业务线对数据源分组，以便快速定位和管理大量数据源。

## 3. 交互设计
```
数据源列表页顶部:
[环境: 全部▼] [业务线: 全部▼] [搜索...]

数据源表单中:
  环境标签: [dev ▼]
  业务线:   [电商 ▼]
  自定义标签: [核心] [只读] [+添加]
```

## 4. API 设计
```
GET /api/datasources?tags=env:prod,biz:ecommerce
POST /api/datasources 增加: { tags: { env: "prod", biz: "ecommerce", custom: ["核心","只读"] } }
```

## 5. 数据模型
bgp-datasources 新增: tags: Map { env: String, biz: String, custom: StringSet }
GSI: tags-env-index (PK: tags.env) 用于按环境过滤

## 6. 后端实现方案
```
1. 创建/更新时保存 tags 到 DynamoDB
2. 列表查询支持 FilterExpression 按 tags 过滤
3. 如果过滤频繁，创建 GSI 优化查询性能
```

## 7. AWS 服务依赖
- DynamoDB (GSI)

## 8. 安全考虑
- 标签值长度限制，防止滥用
- 标签不包含敏感信息

## 9. 验收标准
- [ ] 创建数据源时可选择环境和业务线标签
- [ ] 支持自定义标签添加/删除
- [ ] 列表页可按标签过滤
- [ ] 标签在列表中以 Tag 组件展示

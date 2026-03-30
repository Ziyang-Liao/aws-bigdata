# DS-09 连接参数高级配置

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
支持配置 JDBC 高级参数：charset、timezone、fetchSize、connectTimeout、socketTimeout、自定义 key-value 属性。前端以可折叠的"高级选项"区域展示。

## 2. 用户故事
- 作为 DBA，我希望能配置字符集为 utf8mb4 和时区为 Asia/Shanghai，以避免中文乱码和时间偏移问题。

## 3. 交互设计
```
数据源表单 → [高级选项 ▼] 展开:
┌──────────────────────────────────────┐
│ 字符集:     [utf8mb4 ▼]              │
│ 时区:       [Asia/Shanghai ▼]        │
│ fetchSize:  [1000        ]           │
│ 连接超时:   [30    ] 秒              │
│ 读取超时:   [60    ] 秒              │
│ 自定义参数:                           │
│   [useCompression] = [true ]  [✕]    │
│   [+添加参数]                         │
└──────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources 增加 advancedParams 字段:
{
  advancedParams: {
    charset: "utf8mb4",
    timezone: "Asia/Shanghai",
    fetchSize: 1000,
    connectTimeout: 30,
    socketTimeout: 60,
    customProperties: { "useCompression": "true" }
  }
}
```

## 5. 数据模型
bgp-datasources 新增: advancedParams: Map

## 6. 后端实现方案
```
1. 将 advancedParams 拼接到 JDBC URL 查询参数:
   mysql: ?characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&connectTimeout=30000
   pg: ?charSet=utf8&options=-c timezone=Asia/Shanghai
2. fetchSize 传递给 Glue Job 的 Spark JDBC 读取参数
3. customProperties 直接追加到 JDBC URL
4. Glue Connection 的 ConnectionProperties 中添加对应参数
```

## 7. AWS 服务依赖
- Glue (Connection 参数传递)

## 8. 安全考虑
- 自定义参数需校验 key/value 格式，防止注入
- 不允许通过自定义参数覆盖 username/password

## 9. 验收标准
- [ ] 支持配置 charset、timezone、fetchSize、超时
- [ ] 自定义 key-value 参数可添加/删除
- [ ] 参数正确拼接到 JDBC URL
- [ ] Glue Job 使用配置的 fetchSize

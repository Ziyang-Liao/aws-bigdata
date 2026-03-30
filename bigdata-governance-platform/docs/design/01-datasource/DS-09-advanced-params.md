# DS-09 连接参数高级配置

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
支持配置 JDBC 高级参数：charset（utf8/utf8mb4）、timezone（Asia/Shanghai）、fetchSize、connectTimeout、socketTimeout、自定义 key-value 属性。前端以可折叠的"高级选项"区域展示。

## 2. 用户故事
- 作为 DBA，我希望配置字符集为 utf8mb4 避免中文乱码，配置时区为 Asia/Shanghai 避免时间偏移。
- 作为性能调优人员，我希望调整 fetchSize 和超时参数优化大表读取性能。

## 3. 交互设计
```
数据源表单 → [⚙️ 高级选项] 点击展开:
┌──────────────────────────────────────────────┐
│ ⚙️ 高级选项                                   │
│                                               │
│ 字符集:     [utf8mb4      ▼]                  │
│             utf8 / utf8mb4 / latin1 / gbk     │
│                                               │
│ 时区:       [Asia/Shanghai ▼]                  │
│             UTC / Asia/Shanghai / US/Eastern   │
│                                               │
│ fetchSize:  [1000         ] (每次拉取行数)     │
│ 连接超时:   [30           ] 秒                 │
│ 读取超时:   [60           ] 秒                 │
│                                               │
│ 自定义 JDBC 参数:                              │
│ ┌──────────────────┬──────────────┬───┐       │
│ │ useCompression   │ true         │ ✕ │       │
│ │ rewriteBatched   │ true         │ ✕ │       │
│ └──────────────────┴──────────────┴───┘       │
│ [+ 添加参数]                                   │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources 增加 advancedParams:
{
  "advancedParams": {
    "charset": "utf8mb4",
    "timezone": "Asia/Shanghai",
    "fetchSize": 1000,
    "connectTimeout": 30,
    "socketTimeout": 60,
    "customProperties": {
      "useCompression": "true",
      "rewriteBatchedStatements": "true"
    }
  }
}
```

## 5. 数据模型
bgp-datasources 新增: advancedParams: Map

## 6. 后端实现方案
```
JDBC URL 参数拼接规则:
MySQL:
  ?characterEncoding={charset}
  &serverTimezone={timezone}
  &connectTimeout={connectTimeout*1000}
  &socketTimeout={socketTimeout*1000}
  &{customKey1}={customValue1}&{customKey2}={customValue2}

PostgreSQL:
  ?charSet={charset}
  &options=-c timezone={timezone}
  &connectTimeout={connectTimeout}
  &socketTimeout={socketTimeout}

Oracle:
  通过 Properties 对象传递

Glue Job 中 fetchSize 传递:
  spark.read.jdbc(url, table, properties={"fetchsize": str(fetchSize)})

Glue Connection ConnectionProperties 中添加:
  JDBC_CONNECTION_URL 包含拼接后的完整 URL
```

## 7. AWS 服务依赖
- Glue (Connection 参数传递)

## 8. 安全考虑
- 自定义参数 key/value 校验：key 仅允许字母数字下划线，value 长度限制 256
- 禁止通过自定义参数覆盖 user/password/url 等核心参数
- 黑名单参数: allowLoadLocalInfile, allowUrlInLocalInfile (防止文件读取攻击)

## 9. 验收标准
- [ ] 支持配置 charset、timezone、fetchSize、超时
- [ ] 自定义 key-value 参数可添加/删除
- [ ] 参数正确拼接到 JDBC URL
- [ ] Glue Job 使用配置的 fetchSize
- [ ] 高级选项默认折叠，不影响普通用户
- [ ] 危险参数被黑名单拦截

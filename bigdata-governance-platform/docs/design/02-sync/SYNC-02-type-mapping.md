# SYNC-02 字段类型自动映射

> 优先级: P0 | 模块: 数据同步

## 1. 功能概述
自动将源数据库字段类型映射到目标类型（Redshift/Parquet），显示兼容性状态（兼容/需转换/可能截断）。

## 2. 用户故事
- 作为数据开发者，我希望字段映射时自动处理类型转换，不需要手动查阅类型对照表。

## 3. 交互设计
```
字段映射表增加类型映射列:
源字段     源类型         → 目标类型          状态
user_id   INT            → INTEGER           ✅ 兼容
username  VARCHAR(50)    → VARCHAR(50)       ✅ 兼容
metadata  JSON           → SUPER             ⚠️ 需转换
big_text  LONGTEXT       → VARCHAR(65535)    ⚠️ 可能截断
```

## 4. API 设计
```
POST /api/sync/type-mapping
Request: { sourceType: "mysql", targetType: "redshift", columns: [{ name, type }] }
Response: {
  mappings: [{
    source: { name: "user_id", type: "INT" },
    target: { name: "user_id", type: "INTEGER" },
    compatibility: "compatible"  // compatible | conversion | truncation
  }]
}
```

## 5. 数据模型
类型映射规则表（代码内置常量）:
```
MySQL → Redshift:
INT/INTEGER → INTEGER
BIGINT → BIGINT
FLOAT → REAL
DOUBLE → DOUBLE PRECISION
DECIMAL(p,s) → DECIMAL(p,s)
VARCHAR(n) → VARCHAR(n)
TEXT → VARCHAR(65535)
LONGTEXT → VARCHAR(65535) [truncation]
DATE → DATE
DATETIME → TIMESTAMP
TIMESTAMP → TIMESTAMP
BOOLEAN/TINYINT(1) → BOOLEAN
JSON → SUPER [conversion]
BLOB → VARCHAR(65535) [conversion]
```

## 6. 后端实现方案
```
1. 维护 TypeMappingRegistry: Map<sourceDB, Map<sourceType, { targetType, compatibility }>>
2. 支持 MySQL/PostgreSQL/Oracle/SQLServer → Redshift
3. 支持 MySQL/PostgreSQL/Oracle/SQLServer → Parquet
4. 字段映射时自动调用，返回建议的目标类型
5. 用户可手动覆盖自动映射结果
```

## 7. AWS 服务依赖
无，纯逻辑。

## 8. 安全考虑
- 类型截断时明确警告用户

## 9. 验收标准
- [ ] 支持 MySQL/PG/Oracle/SQLServer → Redshift 类型映射
- [ ] 每个字段显示兼容性状态图标
- [ ] 不兼容类型给出转换建议
- [ ] 用户可手动修改目标类型

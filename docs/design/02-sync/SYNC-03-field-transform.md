# SYNC-03 字段转换函数

> 优先级: P1 | 模块: 数据同步

## 1. 功能概述
在字段映射中支持转换函数：数据脱敏（手机号/邮箱/身份证）、类型转换、日期格式化、默认值、表达式计算、字段拼接。

## 2. 用户故事
- 作为数据开发者，我希望在同步过程中自动脱敏手机号和邮箱，以满足数据安全要求。

## 3. 交互设计
```
字段映射表新增"转换"列:
源字段   类型      → 转换              → 目标字段
phone   VARCHAR   → [脱敏:手机号 ▼]   → phone      138****1234
email   VARCHAR   → [脱敏:邮箱 ▼]     → email      z***@example.com
amount  DECIMAL   → [无 ▼]            → amount
date    DATETIME  → [格式化 ▼]        → date_str   yyyy-MM-dd
                    └─ 格式: [yyyy-MM-dd]
```

## 4. API 设计
```
字段映射中增加 transform 字段:
{
  source: "phone", target: "phone", type: "VARCHAR(20)",
  transform: { type: "mask_phone" }  // 或 { type: "expression", expr: "CONCAT(LEFT(phone,3),'****',RIGHT(phone,4))" }
}

转换类型枚举:
- none: 无转换
- mask_phone: 手机号脱敏 (138****1234)
- mask_email: 邮箱脱敏 (z***@example.com)
- mask_idcard: 身份证脱敏
- type_cast: 类型转换 { targetType: "VARCHAR" }
- date_format: 日期格式化 { format: "yyyy-MM-dd" }
- default_value: 默认值 { value: "N/A" }
- expression: 自定义表达式 { expr: "UPPER(name)" }
- concat: 字段拼接 { fields: ["first_name", "last_name"], separator: " " }
```

## 5. 数据模型
bgp-sync-tasks.fieldMappings 中每个字段增加 transform: Map

## 6. 后端实现方案
```
Glue PySpark 脚本中生成对应转换代码:
- mask_phone: F.concat(F.substring(col,1,3), F.lit("****"), F.substring(col,-4,4))
- mask_email: F.regexp_replace(col, "(?<=.).(?=.*@)", "*")
- date_format: F.date_format(col, format)
- expression: F.expr(expr)
```

## 7. AWS 服务依赖
- Glue (PySpark 转换)

## 8. 安全考虑
- 自定义表达式需校验，防止 SQL 注入
- 脱敏操作不可逆

## 9. 验收标准
- [ ] 支持至少 8 种转换函数
- [ ] 脱敏后数据格式正确
- [ ] 自定义表达式可执行
- [ ] 转换规则保存到任务配置中

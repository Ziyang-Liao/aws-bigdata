# SYNC-07 目标表名映射

> 优先级: P1 | 模块: 数据同步

## 1. 功能概述
支持自定义目标表名（默认与源表同名），支持添加前缀/后缀（如 ods_users、users_raw），支持 schema 映射（源 ecommerce → 目标 public），支持批量重命名规则。

## 2. 用户故事
- 作为数据架构师，我希望同步到 Redshift 时给表名加 ods_ 前缀，区分原始层和加工层。
- 作为开发者，我希望多表同步时能批量设置命名规则，不需要逐个修改。

## 3. 交互设计
```
同步任务 Step 4 目标配置 → 表名映射:
┌──────────────────────────────────────────────┐
│ 表名映射规则:                                 │
│  ● 同名映射  ○ 添加前缀/后缀  ○ 自定义       │
│                                               │
│ 前缀: [ods_    ]  后缀: [         ]          │
│ 目标 Schema: [public ▼]                       │
│                                               │
│ 预览:                                         │
│ 源表           →  目标表                       │
│ users          →  public.ods_users            │
│ orders         →  public.ods_orders           │
│ products       →  public.ods_products         │
│                                               │
│ [自定义] 可逐个修改目标表名                    │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/sync 增加 tableNameMapping:
{
  "tableNameMapping": {
    "rule": "prefix",
    "prefix": "ods_",
    "suffix": "",
    "targetSchema": "public",
    "customMappings": {
      "users": "dim_users",
      "orders": "fact_orders"
    }
  }
}
```

## 5. 数据模型
bgp-sync-tasks 新增: tableNameMapping: Map

## 6. 后端实现方案
```
1. 解析映射规则:
   - same: 目标表名 = 源表名
   - prefix: 目标表名 = prefix + 源表名
   - suffix: 目标表名 = 源表名 + suffix
   - custom: 从 customMappings 查找，未找到则用默认规则
2. Glue PySpark 脚本中:
   target_table = resolve_table_name(source_table, mapping_config)
   df.write.jdbc(url, f"{schema}.{target_table}", ...)
3. S3 路径映射:
   s3://{bucket}/{prefix}/{target_table}/
```

## 7. AWS 服务依赖
- Glue (脚本中应用映射)

## 8. 安全考虑
- 表名校验：仅允许字母、数字、下划线，长度限制 128
- 防止表名冲突：检查目标表是否已存在

## 9. 验收标准
- [ ] 支持同名/前缀/后缀/自定义四种映射规则
- [ ] 批量设置前缀/后缀时实时预览目标表名
- [ ] 自定义映射可逐表修改
- [ ] Glue Job 中正确使用映射后的表名

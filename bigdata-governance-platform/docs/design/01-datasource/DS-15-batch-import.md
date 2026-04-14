# DS-15 批量导入数据源

> 优先级: P2 | 模块: 数据源管理

## 1. 功能概述
支持 CSV/JSON 文件批量导入数据源配置。提供模板下载、导入前校验、进度指示。

## 2. 用户故事
- 作为运维人员，我希望一次性导入 50 个数据源配置，而不是逐个手动创建。

## 3. 交互设计
```
数据源列表 → [批量导入] 按钮:
┌──────────────────────────────────────┐
│ 批量导入数据源                        │
│                                       │
│ [下载 CSV 模板] [下载 JSON 模板]      │
│                                       │
│ 上传文件: [选择文件] datasources.csv   │
│                                       │
│ 校验结果:                             │
│ ✅ 第1行: 业务主库 (mysql)            │
│ ✅ 第2行: 数仓 (postgresql)           │
│ ❌ 第3行: 端口格式错误                │
│                                       │
│ [取消]              [导入 2 条有效记录] │
└──────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/datasources/import-template?format=csv
POST /api/datasources/batch
Content-Type: multipart/form-data
Body: file=datasources.csv

Response: {
  total: 3, success: 2, failed: 1,
  results: [
    { row: 1, status: "success", datasourceId: "xxx" },
    { row: 2, status: "success", datasourceId: "yyy" },
    { row: 3, status: "failed", error: "端口必须为数字" }
  ]
}
```

## 5. 数据模型
无新增，复用 bgp-datasources。

## 6. 后端实现方案
```
1. 解析上传文件 (CSV: csv-parse, JSON: JSON.parse)
2. 逐行校验: name/type/host/port/database/username 必填，port 为数字
3. 校验通过的逐条调用创建流程 (含自动 Glue Connection)
4. 返回每行结果
```

## 7. AWS 服务依赖
- 同 DS-01 (每条记录触发完整创建流程)

## 8. 安全考虑
- 文件大小限制 (最大 1MB)
- 单次最多导入 100 条
- 密码字段在模板中标记为必填但不预填

## 9. 验收标准
- [ ] 支持下载 CSV/JSON 模板
- [ ] 上传后自动校验并显示结果
- [ ] 有效记录批量创建
- [ ] 失败记录显示具体错误原因

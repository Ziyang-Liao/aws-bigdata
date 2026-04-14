# 大数据治理平台 — 详细设计文档索引

> 版本: v2.0 | 日期: 2026-03-29

## 文档结构

```
docs/
├── GAP-ANALYSIS.md              # 功能差距总览
├── DETAILED-DESIGN.md           # 实施计划总览
├── design/
│   ├── 01-datasource/           # 模块1: 数据源管理 (18项)
│   │   ├── DS-01-auto-glue-connection.md
│   │   ├── DS-02-auto-iam-role.md
│   │   ├── DS-03-auto-network.md
│   │   ├── DS-04-secrets-manager.md
│   │   ├── DS-05-health-check.md
│   │   ├── DS-06-rds-discovery.md
│   │   ├── DS-07-more-types.md
│   │   ├── DS-08-ssl-tls.md
│   │   ├── DS-09-advanced-params.md
│   │   ├── DS-10-tags-groups.md
│   │   ├── DS-11-permission.md
│   │   ├── DS-12-data-preview.md
│   │   ├── DS-13-table-stats.md
│   │   ├── DS-14-schema-change-detect.md
│   │   ├── DS-15-batch-import.md
│   │   ├── DS-16-test-detail-report.md
│   │   ├── DS-17-usage-stats.md
│   │   └── DS-18-audit-log.md
│   ├── 02-sync/                 # 模块2: 数据同步 (22项)
│   ├── 03-workflow/             # 模块3: ETL编排 (15项)
│   ├── 04-redshift/             # 模块4: Redshift查询 (12项)
│   ├── 05-schedule/             # 模块5: 调度管理 (10项)
│   ├── 06-monitor/              # 模块6: 任务监控 (12项)
│   ├── 07-governance/           # 模块7: 数据治理 (8项)
│   ├── 08-auth/                 # 模块8: 用户权限 (8项)
│   └── 09-platform/             # 模块9: 平台基础 (10项)
```

## 优先级说明

- **P0**: 商用必须，阻塞用户核心流程
- **P1**: 重要体验，影响用户效率
- **P2**: 增强功能，提升竞争力

## 文档模板

每份设计文档包含以下章节：
1. 功能概述
2. 用户故事
3. 交互设计（含原型）
4. API 设计
5. 数据模型
6. 后端实现方案
7. AWS 服务依赖
8. 安全考虑
9. 验收标准

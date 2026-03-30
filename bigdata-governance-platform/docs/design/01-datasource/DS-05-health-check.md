# DS-05 连接状态心跳检测

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
EventBridge 定时规则(每5分钟)触发 Lambda，遍历所有 active 数据源调用 Glue TestConnection 检测连通性，更新 DynamoDB 状态(active/unreachable/error)。前端显示状态徽章+最后检测时间。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便提升数据源管理的效率和安全性。

## 3. 交互设计
见功能概述中的描述。

## 4. API 设计
```
EventBridge 规则: bgp-ds-health-check, rate(5 minutes)\nLambda: bgp-ds-health-checker\n  1. Scan DynamoDB status=active 的数据源\n  2. 对每个数据源调 Glue GetConnection 获取连接名\n  3. 调 Glue TestConnection\n  4. 更新 DynamoDB: status + lastCheckedAt + lastCheckResult\n  5. 失败时写入告警事件
```

## 5. 数据模型
DynamoDB 新增字段: lastCheckedAt(ISO), lastCheckResult(String)

## 6. 后端实现方案
```
EventBridge 规则: bgp-ds-health-check, rate(5 minutes)\nLambda: bgp-ds-health-checker\n  1. Scan DynamoDB status=active 的数据源\n  2. 对每个数据源调 Glue GetConnection 获取连接名\n  3. 调 Glue TestConnection\n  4. 更新 DynamoDB: status + lastCheckedAt + lastCheckResult\n  5. 失败时写入告警事件
```

## 7. AWS 服务依赖
EventBridge, Lambda, Glue (TestConnection)

## 8. 安全考虑
Lambda 执行角色需要 Glue + DynamoDB 权限\n超时保护: 每个连接测试最多30秒

## 9. 验收标准
- [ ] 每5分钟自动检测所有活跃数据源\n[ ] 不可达时状态自动变为 unreachable\n[ ] 恢复后状态自动变回 active\n[ ] 前端显示最后检测时间和结果

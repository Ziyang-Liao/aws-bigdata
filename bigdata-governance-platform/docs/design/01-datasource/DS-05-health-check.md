# DS-05 连接状态心跳检测

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
通过 EventBridge 定时规则每 5 分钟触发 Lambda，遍历所有 active 数据源，调用 Glue TestConnection 检测连通性，自动更新 DynamoDB 中的状态（active/unreachable/error）。前端实时显示状态徽章和最后检测时间。

## 2. 用户故事
- 作为数据开发者，我希望数据源连接异常时能自动发现并提醒我，而不是等到同步任务失败才知道。
- 作为运维人员，我希望在监控面板上看到所有数据源的实时健康状态。

## 3. 交互设计
```
数据源列表页状态列:
┌──────────────────────────────────────────────┐
│ 数据源          状态              最后检测      │
│ 业务主库-MySQL  ● 已连接 (23ms)  2分钟前       │
│ 数仓-PG        ● 已连接 (45ms)  2分钟前       │
│ ERP-Oracle     ⚠ 不可达          7分钟前       │
│                 └ 原因: Connection refused     │
│                 └ [重新检测]                    │
└──────────────────────────────────────────────┘

状态徽章颜色:
  ● 绿色: active (连接正常)
  ⚠ 黄色: unreachable (网络不通/超时)
  ✕ 红色: error (认证失败/权限不足)
  ○ 灰色: inactive (未启用检测)
```

## 4. API 设计
```
GET /api/datasources/{id}/health
Response: {
  status: "active",
  lastCheckedAt: "2026-03-29T12:00:00Z",
  latencyMs: 23,
  checkResult: {
    network: "pass",
    auth: "pass",
    message: "连接正常"
  }
}

POST /api/datasources/{id}/health-check  (手动触发)
Response: 同上
```

## 5. 数据模型
bgp-datasources 新增字段:
- lastCheckedAt: String (ISO timestamp)
- lastCheckLatencyMs: Number
- lastCheckResult: Map { network: "pass"|"fail", auth: "pass"|"fail", message: String }
- healthCheckEnabled: Boolean (默认 true)

## 6. 后端实现方案
```
CDK 新增资源:
1. EventBridge Rule: bgp-ds-health-check
   - Schedule: rate(5 minutes)
   - Target: Lambda bgp-ds-health-checker

2. Lambda bgp-ds-health-checker:
   a. Scan DynamoDB: status != "inactive" AND healthCheckEnabled = true
   b. 对每个数据源 (并发控制最多 10 个):
      - 调 Glue TestConnection(ConnectionName)
      - 成功: 更新 status=active, latencyMs, lastCheckedAt
      - 失败: 更新 status=unreachable/error, message
      - 连续 3 次失败才改状态 (防抖)
   c. 状态变更时写入告警事件 (SNS)

3. Lambda IAM Role:
   - glue:TestConnection
   - dynamodb:Scan, dynamodb:UpdateItem
   - sns:Publish (告警)

4. 手动触发 API:
   POST /api/datasources/{id}/health-check
   直接调 Glue TestConnection 并更新
```

## 7. AWS 服务依赖
- EventBridge (定时触发)
- Lambda (执行检测逻辑)
- Glue (TestConnection)
- DynamoDB (状态存储)
- SNS (状态变更告警)

## 8. 安全考虑
- Lambda 在 VPC 内运行，可访问私有子网中的 Glue Connection
- 检测频率可配置，避免对源库造成压力
- 连续失败防抖机制，避免网络抖动导致误报
- Lambda 超时设置 60 秒，单个连接测试超时 10 秒

## 9. 验收标准
- [ ] 每 5 分钟自动检测所有启用心跳的数据源
- [ ] 连接不通时状态自动变为 unreachable
- [ ] 恢复后状态自动变回 active
- [ ] 前端显示最后检测时间和延迟
- [ ] 支持手动触发单个数据源检测
- [ ] 连续 3 次失败才变更状态（防抖）
- [ ] 状态变更时发送告警通知

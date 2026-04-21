# Bedrock GenAI Observability 数据查询指南

> 查询时间: 2026-04-21, Region: us-east-1

## 0. 前置条件：确认 Model Invocation Logging 已开启

```bash
aws bedrock get-model-invocation-logging-configuration --region us-east-1
```

执行结果：

```json
{
    "loggingConfig": {
        "cloudWatchConfig": {
            "logGroupName": "<your-log-group-name>",
            "roleArn": "arn:aws:iam::<account-id>:role/service-role/<log-group-role>"
        },
        "textDataDeliveryEnabled": true,
        "imageDataDeliveryEnabled": true,
        "embeddingDataDeliveryEnabled": true
    }
}
```

---

## 1. CloudWatch Metrics：列出所有 Bedrock 模型维度的指标

```bash
aws cloudwatch list-metrics \
  --namespace AWS/Bedrock \
  --query "Metrics[?Dimensions[0].Name=='ModelId'].{MetricName:MetricName,ModelId:Dimensions[0].Value}" \
  --output table \
  --region us-east-1
```

执行结果：

```
------------------------------------------------------------------------
|                              ListMetrics                             |
+-------------------------+--------------------------------------------+
|       MetricName        |                  ModelId                   |
+-------------------------+--------------------------------------------+
|  InputTokenCount        |  amazon.nova-2-multimodal-embeddings-v1:0  |
|  InvocationLatency      |  amazon.nova-2-multimodal-embeddings-v1:0  |
|  EstimatedTPMQuotaUsage |  amazon.nova-2-multimodal-embeddings-v1:0  |
|  Invocations            |  amazon.nova-2-multimodal-embeddings-v1:0  |
|  InvocationClientErrors |  amazon.nova-2-multimodal-embeddings-v1:0  |
|  EstimatedTPMQuotaUsage |  us.anthropic.claude-opus-4-6-v1           |
|  OutputTokenCount       |  us.anthropic.claude-opus-4-6-v1           |
|  InputTokenCount        |  us.anthropic.claude-opus-4-6-v1           |
|  Invocations            |  us.anthropic.claude-opus-4-6-v1           |
|  TimeToFirstToken       |  us.anthropic.claude-opus-4-6-v1           |
|  InvocationLatency      |  us.anthropic.claude-opus-4-6-v1           |
|  OutputTokenCount       |  us.anthropic.claude-opus-4-7              |
|  InputTokenCount        |  us.anthropic.claude-opus-4-7              |
|  Invocations            |  us.anthropic.claude-sonnet-4-6            |
|  InvocationLatency      |  us.anthropic.claude-sonnet-4-6            |
|  TimeToFirstToken       |  us.anthropic.claude-sonnet-4-6            |
|  EstimatedTPMQuotaUsage |  us.anthropic.claude-sonnet-4-6            |
|  InputTokenCount        |  us.anthropic.claude-sonnet-4-6            |
|  OutputTokenCount       |  us.anthropic.claude-sonnet-4-6            |
|  InvocationLatency      |  us.anthropic.claude-opus-4-7              |
|  TimeToFirstToken       |  us.anthropic.claude-opus-4-7              |
|  EstimatedTPMQuotaUsage |  us.anthropic.claude-opus-4-7              |
|  Invocations            |  us.anthropic.claude-opus-4-7              |
|  OutputTokenCount       |  moonshotai.kimi-k2.5                      |
|  InputTokenCount        |  moonshotai.kimi-k2.5                      |
|  TimeToFirstToken       |  us.amazon.nova-pro-v1:0                   |
|  EstimatedTPMQuotaUsage |  us.amazon.nova-pro-v1:0                   |
|  Invocations            |  us.amazon.nova-pro-v1:0                   |
|  InvocationLatency      |  us.amazon.nova-pro-v1:0                   |
|  InputTokenCount        |  us.amazon.nova-pro-v1:0                   |
|  OutputTokenCount       |  us.amazon.nova-pro-v1:0                   |
|  EstimatedTPMQuotaUsage |  zai.glm-5                                 |
|  TimeToFirstToken       |  zai.glm-5                                 |
|  Invocations            |  zai.glm-5                                 |
|  InvocationLatency      |  zai.glm-5                                 |
|  OutputTokenCount       |  zai.glm-5                                 |
|  InputTokenCount        |  zai.glm-5                                 |
+-------------------------+--------------------------------------------+
```

---

## 2. CloudWatch Metrics：查询某模型的 InputTokenCount 聚合

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock \
  --metric-name InputTokenCount \
  --dimensions Name=ModelId,Value=us.anthropic.claude-sonnet-4-6 \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 86400 \
  --statistics Sum \
  --region us-east-1
```

执行结果：

```json
{
    "Label": "InputTokenCount",
    "Datapoints": [
        {
            "Timestamp": "2026-04-21T00:00:00+00:00",
            "Sum": 142182.0,
            "Unit": "Count"
        }
    ]
}
```

> 注意：CloudWatch Metrics 只能按 ModelId 维度聚合，无法区分 session/user。要实现更细粒度统计，需要查询 Invocation Log。

---

## 3. Logs Insights：按模型 + 调用者汇总统计

```bash
QUERY_ID=$(aws logs start-query \
  --log-group-name "<your-log-group-name>" \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, modelId,
      input.inputTokenCount as inputTokens,
      output.outputTokenCount as outputTokens,
      identity.arn as caller
    | stats sum(inputTokens) as totalInputTokens,
            sum(outputTokens) as totalOutputTokens,
            count(*) as invocationCount
      by modelId, caller
    | sort totalInputTokens desc
  ' \
  --region us-east-1 \
  --query 'queryId' --output text)

sleep 5

aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

执行结果（89 条记录匹配，864,092 bytes 扫描）：

| 模型 | 调用者类型 | 总输入Token | 总输出Token | 调用次数 |
|---|---|---|---|---|
| us.anthropic.claude-opus-4-7 | 直接调用 (Admin/<user>) | 117,600 | 38,598 | 27 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-3c28c88e | 33,094 | 1,313 | 1 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-1784b40f | 33,094 | 1,373 | 1 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-0df0dd84 | 33,094 | 1,382 | 1 |
| us.amazon.nova-pro-v1:0 | SageMaker | 13,068 | 2,031 | 21 |
| us.anthropic.claude-sonnet-4-6 | SageMaker | 8,235 | 604 | 7 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-2d850467 | 7,537 | 149 | 4 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-74e25c23 | 5,643 | 397 | 3 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-3ff0a14d | 3,674 | 84 | 2 |
| zai.glm-5 | SageMaker | 3,655 | 469 | 12 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-4561fd16 | 3,576 | 91 | 2 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-6fcbdecc | 3,561 | 74 | 2 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-d685ae8b | 3,561 | 68 | 2 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-bee8a07e | 3,561 | 67 | 2 |
| us.anthropic.claude-sonnet-4-6 | AgentCore session-538cc9e2 | 3,552 | 56 | 2 |

---

## 4. Logs Insights：仅 AgentCore 调用明细（按 session 粒度）

```bash
QUERY_ID=$(aws logs start-query \
  --log-group-name "<your-log-group-name>" \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    filter identity.arn like /BedrockAgentCore/
    | fields @timestamp, modelId, requestId,
        input.inputTokenCount as inputTokens,
        output.outputTokenCount as outputTokens,
        identity.arn as caller,
        inferenceRegion
    | sort @timestamp desc
  ' \
  --region us-east-1 \
  --query 'queryId' --output text)

sleep 5

aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

执行结果（22 条记录匹配）：

| 时间 (UTC) | Session ID | Runtime ID | 输入Token | 输出Token | 推理区域 |
|---|---|---|---|---|---|
| 07:28:05 | 0df0dd84 | runtime-A | 33,094 | 1,382 | us-east-2 |
| 06:57:41 | 1784b40f | runtime-A | 33,094 | 1,373 | us-east-2 |
| 06:55:06 | 3c28c88e | runtime-A | 33,094 | 1,313 | us-east-2 |
| 05:47:19 | 74e25c23 | runtime-B | 1,968 | 271 | us-east-2 |
| 05:43:37 | 74e25c23 | runtime-B | 1,871 | 82 | us-east-2 |
| 05:43:36 | 74e25c23 | runtime-B | 1,804 | 44 | us-east-2 |
| 05:17:14 | 3ff0a14d | runtime-C | 1,872 | 30 | us-east-2 |
| 05:17:13 | 3ff0a14d | runtime-C | 1,802 | 54 | us-east-2 |
| 05:17:04 | 2d850467 | runtime-C | 1,968 | 37 | us-east-2 |
| 05:17:03 | 2d850467 | runtime-C | 1,910 | 35 | us-east-2 |
| 05:16:39 | 2d850467 | runtime-C | 1,858 | 43 | us-east-2 |
| 05:16:37 | 2d850467 | runtime-C | 1,801 | 34 | us-east-2 |
| 03:25:03 | 4561fd16 | runtime-D | 1,823 | 37 | us-east-2 |
| 03:25:01 | 4561fd16 | runtime-D | 1,753 | 54 | us-east-2 |
| 03:23:12 | d685ae8b | runtime-D | 1,809 | 34 | us-east-2 |
| 03:23:10 | d685ae8b | runtime-D | 1,752 | 34 | us-east-2 |
| 03:22:55 | 6fcbdecc | runtime-D | 1,809 | 40 | us-east-2 |
| 03:22:52 | 6fcbdecc | runtime-D | 1,752 | 34 | us-east-2 |
| 03:22:44 | bee8a07e | runtime-D | 1,809 | 33 | us-east-2 |
| 03:22:42 | bee8a07e | runtime-D | 1,752 | 34 | us-east-2 |
| 03:17:54 | 538cc9e2 | runtime-D | 1,800 | 31 | us-east-2 |
| 03:17:52 | 538cc9e2 | runtime-D | 1,752 | 25 | us-east-2 |

> 所有 AgentCore 调用均使用 `us.anthropic.claude-sonnet-4-6`，推理区域均为 `us-east-2`。

---

## 5. Logs Insights：全量调用明细

```bash
QUERY_ID=$(aws logs start-query \
  --log-group-name "<your-log-group-name>" \
  --start-time $(date -d '24 hours ago' +%s) \
  --end-time $(date +%s) \
  --query-string '
    fields @timestamp, modelId, operation, requestId,
      input.inputTokenCount as inputTokens,
      output.outputTokenCount as outputTokens,
      input.cacheReadInputTokenCount as cacheReadTokens,
      input.cacheWriteInputTokenCount as cacheWriteTokens,
      identity.arn as caller,
      inferenceRegion
    | sort @timestamp desc
    | limit 200
  ' \
  --region us-east-1 \
  --query 'queryId' --output text)

sleep 6

aws logs get-query-results --query-id "$QUERY_ID" --region us-east-1
```

> 返回全部 89 条记录，每条包含 timestamp、modelId、operation、requestId、inputTokens、outputTokens、cacheReadTokens、cacheWriteTokens、caller、inferenceRegion。

---

## 6. 总汇总

| 来源 | 模型 | 调用次数 | 总输入Token | 总输出Token |
|---|---|---|---|---|
| 直接调用 (Console/CLI) | claude-opus-4-7 | 27 | 117,600 | 38,598 |
| AgentCore (9个session) | claude-sonnet-4-6 | 22 | 133,947 | 5,681 |
| SageMaker | claude-sonnet-4-6 | 7 | 8,235 | 604 |
| SageMaker | nova-pro-v1:0 | 21 | 13,068 | 2,031 |
| SageMaker | glm-5 | 12 | 3,655 | 469 |
| **合计** | | **89** | **276,505** | **47,383** |

---

## 日志字段说明

每条 Model Invocation Log (schemaType: `ModelInvocationLog`) 包含：

| 字段 | 说明 | 用途 |
|---|---|---|
| `modelId` | 模型 ID 或 inference-profile ARN | 按模型统计 |
| `requestId` | 唯一请求 ID | 单次调用追踪 |
| `operation` | API 操作 (Converse/ConverseStream/InvokeModel) | 区分调用方式 |
| `identity.arn` | 调用者 IAM ARN | 按 user/session 统计 |
| `input.inputTokenCount` | 输入 token 数 | 费用计算 |
| `output.outputTokenCount` | 输出 token 数 | 费用计算 |
| `input.cacheReadInputTokenCount` | 缓存读取 token | 缓存命中分析 |
| `input.cacheWriteInputTokenCount` | 缓存写入 token | 缓存写入分析 |
| `inferenceRegion` | 实际推理区域 | 跨区域路由分析 |
| `timestamp` | 调用时间 | 时间维度分析 |

### identity.arn 解析规则

```
# 直接调用 → 按 UserName 区分用户
assumed-role/<RoleName>/<UserName>

# AgentCore → 按 session-id 区分会话, runtime-id 区分 Agent 实例
assumed-role/AmazonBedrockAgentCoreSDKRuntime-<region>-<runtime-id>/BedrockAgentCore-<session-id>

# SageMaker → 统一身份
assumed-role/AmazonSageMakerServiceCatalogProductsExecutionRole/SageMaker
```

---

## 涉及的 AWS API

| API | 服务 | 用途 |
|---|---|---|
| `bedrock:GetModelInvocationLoggingConfiguration` | Bedrock | 查看日志配置 |
| `logs:StartQuery` | CloudWatch Logs | 发起 Logs Insights 查询 |
| `logs:GetQueryResults` | CloudWatch Logs | 获取查询结果 |
| `logs:FilterLogEvents` | CloudWatch Logs | 直接过滤日志事件 |
| `cloudwatch:ListMetrics` | CloudWatch | 列出可用 metrics 和维度 |
| `cloudwatch:GetMetricStatistics` | CloudWatch | 单个 metric 聚合统计 |
| `cloudwatch:GetMetricData` | CloudWatch | 批量获取 metrics |

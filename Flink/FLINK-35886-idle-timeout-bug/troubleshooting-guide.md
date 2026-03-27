# idle-timeout 问题排查、可观测性与防御策略

## 一、排查 idle-timeout 问题

### 1.1 快速判断是否命中 FLINK-35886

```
Flink 版本 < 1.20.1?
  ├─ 是 → 配置了 idle-timeout?
  │        ├─ 是 → 存在反压或水印对齐?
  │        │        ├─ 是 → ⚠️ 高度疑似命中 Bug
  │        │        └─ 否 → 可能是其他原因
  │        └─ 否 → 不会命中此 Bug
  └─ 否 → 已修复，不会命中
```

### 1.2 通过 Flink Metrics 排查

| Metric | 位置 | 含义 | 异常判断 |
|--------|------|------|----------|
| `numLateRecordsDropped` | 窗口算子 | 被丢弃的迟到记录数 | > 0 且持续增长 = 数据丢失 |
| `currentInputWatermark` | 各算子 | 当前水印值 | 突然大幅跳跃 = 水印异常 |
| `sourceIdleTime` | Source 算子 | Source idle 累计时间 | 异常大 = 可能被误判 idle |
| `watermarkAlignmentDrift` | Source 算子 | 水印对齐漂移量 | Long.MIN = 对齐异常 |
| `isBackPressured` | 各算子 | 是否有反压 | true + idle-timeout = 触发条件 |

**REST API 查询：**

```bash
# 获取 Job ID
curl http://<flink-ui>/jobs

# 查询关键指标 (URL encode 方括号)
curl "http://<flink-ui>/jobs/<job-id>/vertices/<vertex-id>/subtasks/metrics?get=numLateRecordsDropped"
curl "http://<flink-ui>/jobs/<job-id>/vertices/<vertex-id>/subtasks/metrics?get=currentInputWatermark"
curl "http://<flink-ui>/jobs/<job-id>/vertices/<vertex-id>/subtasks/metrics?get=sourceIdleTime"
```

### 1.3 通过日志排查

```bash
yarn logs -applicationId <app-id> | grep -i -E \
  "idle|WatermarkStatus|StatusWatermarkValve|alignment|blocked"
```

### 1.4 通过 Flink Web UI 排查

```
Flink Web UI → Running Jobs → 选择 Job
  → Source 算子 → Subtasks → 对比各 subtask 的 Watermark（大幅差异 = 异常）
  → Source 算子 → Metrics → 添加 numLateRecordsDropped / sourceIdleTime
  → Source 算子 → BackPressure → HIGH + idle-timeout = 触发条件
```

## 二、可观测性建设

### 2.1 Metrics Reporter 配置

```yaml
# flink-conf.yaml — 推送到 CloudWatch
metrics.reporter.cloudwatch.class: org.apache.flink.metrics.cloudwatch.CloudWatchReporter
metrics.reporter.cloudwatch.namespace: Flink/Production
metrics.reporter.cloudwatch.region: us-east-1
```

### 2.2 告警规则

| 告警 | 条件 | 级别 |
|------|------|------|
| 数据丢失 | `numLateRecordsDropped` 增长率 > 0/min | P1 |
| 水印跳跃 | `currentInputWatermark` 5分钟内变化 > 1小时 | P1 |
| 异常 idle | `sourceIdleTime` > 2 × idle-timeout 配置值 | P2 |
| 反压持续 | `isBackPressured` = true 持续 > 5min | P2 |

> `numLateRecordsDropped` 是发现数据静默丢失的**唯一自动化手段**，务必配置告警。

## 三、保障数据流正常处理

### 3.1 根本解决：升级 Flink

升级到 1.19.2+ / 1.20.1+ / 2.0.0+（或对应 EMR 版本）。

### 3.2 无法升级时的规避方案

**场景 A：水印对齐 + idle-timeout → 关闭水印对齐**

```sql
-- 去掉以下配置:
--   'scan.watermark.alignment.group'
--   'scan.watermark.alignment.max-drift'
--   'scan.watermark.alignment.update-interval'
-- 保留 idle-timeout
SET 'table.exec.source.idle-timeout' = '60s';
```

**场景 B：反压 + idle-timeout → 增大 timeout 或关闭**

```sql
-- 方案1: 增大到远超反压持续时间
SET 'table.exec.source.idle-timeout' = '600s';

-- 方案2: 关闭 idle-timeout，改用并行度匹配 partition 数
SET 'parallelism.default' = '3';  -- = kafka partition 数
```

**场景 C：部分 partition 长期无数据 → 上游心跳替代 idle-timeout**

```python
# Producer: 每个 partition 每 30s 发心跳
from kafka import KafkaProducer
import time, json

producer = KafkaProducer(bootstrap_servers='...',
    value_serializer=lambda v: json.dumps(v).encode())
while True:
    for p in range(NUM_PARTITIONS):
        producer.send('topic',
            value={"_heartbeat": True, "ts": int(time.time())},
            partition=p)
    producer.flush()
    time.sleep(30)
```

```sql
-- Flink 侧过滤心跳，不需要 idle-timeout
SELECT * FROM source_table
WHERE _heartbeat IS NULL OR _heartbeat = false;
```

### 3.3 决策流程图

```
能升级 Flink 1.20.1+?
  ├─ 是 → 直接升级，问题解决 ✅
  └─ 否 → 用了水印对齐?
            ├─ 是 → 关闭水印对齐
            └─ 否 → 有反压?
                      ├─ 是 → 增大 timeout 或关闭 + 匹配并行度
                      └─ 否 → 部分 partition 无数据?
                                ├─ 是 → 上游发心跳替代 idle-timeout
                                └─ 否 → 关闭 idle-timeout 即可
```

**核心原则：在 Flink < 1.20.1 上，idle-timeout 和反压/水印对齐不能同时安全使用。**

## 四、指标实测验证（EMR 7.11.0 / Flink 1.20.0）

以下所有指标均在 FLINK-35886 复现环境中通过 REST API 实际验证，确认存在且有值。

### 4.1 REST API 接口格式

```
GET /jobs/<job-id>/vertices/<vertex-id>/subtasks/metrics?get=<metric-name>

返回格式:
[{"id":"<metric-name>","min":0.0,"max":0.0,"avg":0.0,"sum":0.0,"skew":0.0}]

注意: metric name 中的 [] 需要 URL encode → %5B %5D
```

### 4.2 Source 算子指标（vertex: `Source: order_events[1] -> Calc[2]`）

| 指标名 | 实测值 | 是否存在 | 说明 |
|--------|--------|----------|------|
| `Source__order_events[1].sourceIdleTime` | **3,416,399 ms** (~57min) | ✅ 存在 | Source 被标记 idle 的累计时间。异常大 = 误判 |
| `Source__order_events[1].watermarkAlignmentDrift` | **-9.22E18** (Long.MIN) | ✅ 存在 | 水印对齐漂移。Long.MIN = 对齐状态异常 |
| `Source__order_events[1].watermarkLag` | **1.77E12 ms** | ✅ 存在 | 水印与当前时间的差距。极大 = 水印停滞 |
| `Source__order_events[1].currentOutputWatermark` | **4,996,000 ms** (4996s) | ✅ 存在 | Source 输出水印。跳跃到 4996 = 异常 |
| `Source__order_events[1].currentEmitEventTimeLag` | **59,604 ms** | ✅ 存在 | 最后发出事件的时间延迟 |
| `isBackPressured` | **[]** (空数组) | ⚠️ 存在但无值 | 本场景无反压，所以返回空 |
| `accumulateBackPressuredTimeMs` | **0** | ✅ 存在 | 累计反压时间。本场景为 0 |
| `accumulateIdleTimeMs` | **3,721,296 ms** (~62min) | ✅ 存在 | 算子级别 idle 累计时间 |
| `accumulateBusyTimeMs` | **0** | ✅ 存在 | 算子忙碌时间。0 = 完全空闲 |

### 4.3 窗口聚合算子指标（vertex: `GroupWindowAggregate[4] -> Calc[5] -> Sink: result_sink[6]`）

| 指标名 | 实测值 | 是否存在 | 说明 |
|--------|--------|----------|------|
| `GroupWindowAggregate[4].numLateRecordsDropped` | **13** | ✅ 存在 | **关键指标！** 13 条数据被丢弃 |
| `GroupWindowAggregate[4].lateRecordsDroppedRate` | **0** | ✅ 存在 | 当前丢弃速率（数据已发完所以为 0） |
| `GroupWindowAggregate[4].watermarkLatency` | **1.77E12 ms** | ✅ 存在 | 水印延迟 |
| `currentInputWatermark` | **4,996,000 ms** (4996s) | ✅ 存在 | 聚合算子输入水印 |

### 4.4 指标可用性总结

| 文档中提到的指标 | REST API | Flink Web UI Metrics Tab | 实测结论 |
|-----------------|----------|--------------------------|----------|
| `numLateRecordsDropped` | ✅ 有值 | ✅ 可添加 | **最关键的告警指标** |
| `currentInputWatermark` | ✅ 有值 | ✅ 可添加 | 可检测水印跳跃 |
| `sourceIdleTime` | ✅ 有值 | ✅ 可添加 | 可检测 idle 误判 |
| `watermarkAlignmentDrift` | ✅ 有值 | ✅ 可添加 | 可检测对齐异常 |
| `isBackPressured` | ⚠️ 无反压时返回空数组 | ✅ BackPressure Tab | 需通过 BackPressure Tab 查看 |
| `accumulateBackPressuredTimeMs` | ✅ 有值 | ✅ 可添加 | 比 isBackPressured 更可靠 |
| `watermarkLag` | ✅ 有值 | ✅ 可添加 | 文档未提但很有用 |
| `accumulateIdleTimeMs` | ✅ 有值 | ✅ 可添加 | 算子级别 idle 时间 |

### 4.5 注意事项

1. **`isBackPressured`** 在无反压时返回空数组 `[]` 而非 `false`，建议改用 `accumulateBackPressuredTimeMs > 0` 判断
2. **`watermarkAlignmentDrift`** 值为 `-9.22E18`（Long.MIN_VALUE）表示对齐状态异常或未初始化
3. **`sourceIdleTime`** 和 **`accumulateIdleTimeMs`** 是两个不同指标：前者是 Source connector 级别，后者是算子级别
4. 所有指标在 Flink Web UI 的 **Metrics Tab** 中均可通过搜索添加到图表中实时观察

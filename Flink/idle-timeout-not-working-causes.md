# Flink idle-timeout 不生效的常见原因排查

除 [FLINK-35886](./FLINK-35886-idle-timeout-bug/) bug 之外，idle-timeout "不生效"还有以下常见原因。

## 一、配置层面

### 1.1 配置未正确传递

```sql
-- ❌ SET 写在 INSERT 之后，不生效
INSERT INTO sink SELECT ...;
SET 'table.exec.source.idle-timeout' = '60s';

-- ✅ SET 必须在 DDL/DML 之前
SET 'table.exec.source.idle-timeout' = '60s';
CREATE TABLE ...;
INSERT INTO sink SELECT ...;
```

### 1.2 配置值格式错误

```sql
-- ❌ 没带单位 / 单位错误
SET 'table.exec.source.idle-timeout' = '60';
SET 'table.exec.source.idle-timeout' = '60sec';

-- ✅ 正确格式
SET 'table.exec.source.idle-timeout' = '60s';
SET 'table.exec.source.idle-timeout' = '60000ms';
SET 'table.exec.source.idle-timeout' = '1min';
```

### 1.3 被全局配置覆盖

`flink-conf.yaml` 中的全局配置可能覆盖 SQL 中的 SET：

```yaml
# 0 = 禁用
table.exec.source.idle-timeout: 0ms
```

排查：Flink Web UI → Job → Configuration → 搜索 `idle-timeout` 确认实际生效值。

## 二、并行度与 Partition 分配（最常见原因）

### 2.1 并行度 > Partition 数

```
Kafka Topic: 3 partitions
Flink Source parallelism: 5

  subtask-0 → partition-0  (有数据)
  subtask-1 → partition-1  (有数据)
  subtask-2 → partition-2  (有数据)
  subtask-3 → 无 partition  ← 永远没有 split，watermark 卡在 Long.MIN
  subtask-4 → 无 partition  ← 同上
```

未分配 split 的 subtask 不会发出 watermark，也不会被标记为 idle — **watermark 卡死在 Long.MIN_VALUE**，看起来像 idle-timeout 不生效。

验证方法：

```bash
# 检查各 subtask 的 watermark
curl "http://<flink-ui>/jobs/<job>/vertices/<source-vertex>/subtasks/metrics?get=currentInputWatermark"

# 如果某些 subtask watermark = -9223372036854775808 (Long.MIN) → 没有被分配 partition
```

### 2.2 所有 Partition 都没有数据

idle-timeout 解决的是**部分 partition 无数据**的场景。如果**所有 partition 都没有数据**，所有 subtask 都被标记为 idle，没有任何 active source 推动水印，watermark 仍然不会推进。

## 三、Source Connector 层面

### 3.1 新版 KafkaSource vs 旧版 FlinkKafkaConsumer

| 版本 | API | idle-timeout 实现 |
|------|-----|-------------------|
| 旧版 | FlinkKafkaConsumer | SourceFunction 内部直接检测 |
| 新版 | KafkaSource (FLIP-27) | SourceOperator → 框架统一管理 |

EMR 7.11.0 的 `flink-sql-connector-kafka-3.4.0.jar` 使用新版 KafkaSource，idle-timeout 由框架管理。如果客户用旧版 connector JAR 或自定义 Source 且未实现 `SourceOutput.markIdle()`，idle-timeout 不会生效。

## 四、Watermark 策略层面

### 4.1 容忍度过大导致的延迟假象

```sql
WATERMARK FOR ts AS ts - INTERVAL '5' MINUTE
```

即使 idle-timeout 生效，窗口也要等 watermark 超过窗口结束时间才触发。容忍度 5 分钟意味着窗口至少延迟 5 分钟触发，看起来像"不生效"。

### 4.2 WATERMARK 定义在错误字段上

```sql
-- ❌ processing time 不需要 idle-timeout
WATERMARK FOR proc_time AS proc_time
```

## 五、UNION ALL / 多 Source 场景

```sql
SELECT * FROM source_a
UNION ALL
SELECT * FROM source_b
```

联合水印 = min(source_a, source_b)。如果 source_b idle-timeout 生效但 source_a 没有，整体水印仍被 source_a 卡住。每个 source 需要**独立检查**。

## 六、排查清单

```
1. 配置是否正确?
   → Flink Web UI → Job → Configuration → 搜索 idle-timeout
   → 确认值 > 0 且格式正确

2. 并行度 vs partition 数?  ← 最常见原因
   → 确认 source parallelism ≤ kafka partition 数
   → 检查各 subtask 的 currentInputWatermark 是否有 Long.MIN

3. 是否所有 partition 都无数据?
   → idle-timeout 只解决"部分无数据"，不解决"全部无数据"

4. Watermark 容忍度是否过大?
   → 检查 WATERMARK FOR ts AS ts - INTERVAL 'X' 的 X 值

5. Source connector 是否支持?
   → 官方 Kafka connector ✅
   → 自定义 Source 需实现 markIdle()

6. 是否命中 FLINK-35886?
   → Flink < 1.20.1 + (反压 or 水印对齐) + idle-timeout
   → 检查 sourceIdleTime 和 numLateRecordsDropped

7. 多 Source UNION ALL?
   → 每个 source 独立检查，联合水印取最小值
```

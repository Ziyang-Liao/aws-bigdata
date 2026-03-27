# FLINK-35886: Watermark Idleness Timeout 误判问题复现与分析

## 一、Bug 概述

| 字段 | 内容 |
|------|------|
| Issue ID | [FLINK-35886](https://issues.apache.org/jira/browse/FLINK-35886) |
| 关联 FLIP | FLIP-471 |
| 影响版本 | < 1.19.2, < 1.20.1, < 2.0.0 |
| 修复版本 | 1.19.2, 1.20.1, 2.0.0 |
| 严重程度 | Critical（数据静默丢失） |
| EMR 影响 | EMR 7.11.0 (Flink 1.20.0) **受影响** |

**一句话总结：** Source 因反压或水印对齐被运行时阻塞期间，阻塞时间被错误计入 idle-timeout，导致仍有数据的 Source/Split 被误标记为 IDLE，引发水印跳跃、数据被判定为迟到而静默丢弃。

## 二、Bug 原理

### 2.1 正常的 idle-timeout 机制

```
Source 有 3 个 Split（对应 Kafka 3 个 Partition）:
  Split-0: 持续有数据 → 水印正常推进
  Split-1: 持续有数据 → 水印正常推进
  Split-2: 长期无数据 → 水印停留在 -∞

  联合水印 = min(Split-0, Split-1, Split-2) = -∞ → 卡死！

引入 idle-timeout 后:
  Split-2 超过 idle-timeout 无数据 → 标记为 IDLE
  联合水印 = min(Split-0, Split-1) → 正常推进 ✓
```

### 2.2 Bug 的根因

旧版空闲检测使用**墙上时钟（wall clock）**计时：

```
elapsed = System.currentTimeMillis() - lastActivityTime
if elapsed > idleTimeout:
    markAsIdle()  // ❌ 不区分"真的没数据"还是"被阻塞发不出数据"
```

当 Source 被**反压**或**水印对齐**阻塞时，无法 emit 数据，但 wall clock 持续走动，导致 elapsed 超过阈值，**有数据的 Source 被错误标记为 IDLE**。

### 2.3 触发条件

三个条件同时满足即可触发：

1. 配置了 `idle-timeout`（`table.exec.source.idle-timeout` 或 `WatermarkStrategy.withIdleness()`）
2. 存在**反压**或**水印对齐**（`scan.watermark.alignment.max-drift`）
3. 不同分区/Split 的数据速率差异较大

### 2.4 后果链

```
Source 被阻塞 → idle 计时器错误累积 → 误标记 IDLE
→ 联合水印只看其他 Split → 水印跳跃
→ 被阻塞的 Source 恢复后，其数据 event_time << 当前水印
→ 数据被判定为迟到 → 静默丢弃（不报错、不告警）
```

## 三、EMR 7.11.0 复现验证

### 3.1 测试环境

| 组件 | 版本/配置 |
|------|-----------|
| EMR | 7.11.0 |
| Flink | 1.20.0 (受影响版本) |
| Kafka | 自建 2.8.1 (EC2, 私有子网) |
| 网络 | 全部私有子网, 安全组仅 VPC 内部通信 |
| Topic | `order_events`, 2 partitions |

### 3.2 复现场景（水印对齐 + idle 误判）

```
Kafka Topic: order_events (2 partitions)
Flink Source 并行度: 1 (一个 subtask 读两个 split)
Watermark Alignment: maxDrift = 30s
Idle Timeout: 60s

Split-A (Partition 0): 高速推进 event_ts 1000→1042, 然后有后续数据 1045~1060
Split-B (Partition 1): 慢速推进 event_ts 1000→1004 (60秒), 然后跳跃到 5000
```

### 3.3 复现结果

**Flink Metrics 证据：**

| Metric | 值 | 含义 |
|--------|-----|------|
| `numLateRecordsDropped` | **13** | 13 条合法数据被丢弃 |
| `currentInputWatermark` | **4,996,000 ms** (4996s) | 联合水印异常跳跃 |
| `sourceIdleTime` | **196,505 ms** (~196s) | Source 被错误标记 idle |

**窗口输出（print sink）：**

```
+I[00:16:40, 00:16:50, 1, 1000.0]    → A_1000 ✅
+I[00:16:50, 00:17:00, 1, 1010.0]    → A_1010 ✅
+I[00:17:00, 00:17:10, 1, 1020.0]    → A_1020 ✅
+I[00:17:10, 00:17:20, 1, 1030.0]    → A_1030 ✅
+I[00:17:20, 00:17:30, 3, 3135.0]    → A_1042 + A_1045 + A_1048 ✅
+I[00:17:30, 00:17:40, 2, 2105.0]    → A_1050 + A_1055 ✅
+I[00:17:40, 00:17:50, 1, 1060.0]    → A_1060 ✅

❌ B 系列 13 条数据 (B1~B13, event_ts 1000~1004) 全部被丢弃
❌ B_JUMP, B_JUMP2 (event_ts 5000~5001) 窗口未触发
```

**结论：** `sourceIdleTime=196505ms` 证实 Source 被错误标记为 idle，`numLateRecordsDropped=13` 证实数据被静默丢弃。**FLINK-35886 在 EMR 7.11.0 成功复现。**

## 四、修复方案

### 4.1 修复原理（FLIP-471）

引入 `PausableRelativeClock`，被阻塞期间暂停计时：

```
旧版：idle时间 = 墙上时钟（包含阻塞时间）
  ┌──活跃──┬──被阻塞──┬──活跃──┐
  │ 10s   │   50s   │  5s   │
  idle计时: ←────── 65s ──────→  ← 超过阈值!

新版：idle时间 = 仅累积活跃时间
  ┌──活跃──┬──被阻塞──┬──活跃──┐
  │ 10s   │ (暂停)  │  5s   │
  idle计时: ←10s→     ←15s→     ← 远未达到阈值
```

### 4.2 解决方案优先级

| 优先级 | 方案 | 说明 |
|--------|------|------|
| 1 | **升级 Flink** | 升级到 1.19.2+ / 1.20.1+ / 2.0.0+ |
| 2 | 关闭 idle-timeout | 同时确保并行度 ≤ Source 分区数 |
| 3 | 关闭水印对齐 | 去掉 `watermark alignment` 配置 |
| 4 | 上游发心跳 | 每个 Partition 定期发心跳消息 |
| 5 | 切换 Processing Time | 绕开 Event Time + Watermark |

### 4.3 排查步骤

```
Step 1: 确认 Flink 版本 < 1.20.1 → 命中此 Bug
Step 2: 确认是否配置了 idle-timeout
Step 3: 确认是否存在反压或水印对齐
Step 4: 观察 Flink Web UI → Subtasks → Watermark 是否有突然跳跃
Step 5: 检查 Metrics:
  - numLateRecordsDropped > 0 → 高度疑似
  - sourceIdleTime 异常大 → 确认命中
```

## 五、文件说明

| 文件 | 说明 |
|------|------|
| `flink-35886-reproduce.sql` | Flink SQL 复现脚本（含水印对齐配置） |
| `produce-35886.py` | Python 数据生产者（精确控制 partition 和时间线） |
| `run-35886-test.sh` | EMR 上一键运行脚本（启动 Flink Session + 提交 SQL + 收集结果） |
| `flink-sql-idle-timeout-test.sql` | 基础 idle-timeout 测试（datagen，不依赖 Kafka） |
| `kafka-bootstrap.sh` | EC2 上安装 Kafka 2.8.1 的 bootstrap 脚本 |

## 六、快速复现指南

### 前置条件

- AWS 账号，有 VPC + 私有子网 + NAT Gateway
- EMR 7.11.0 集群（Flink + Hadoop）
- 自建 Kafka 2.8.1 EC2 实例（同 VPC 私有子网）

### 步骤

```bash
# 1. 在 Kafka EC2 上创建 topic
kafka-topics.sh --create --topic order_events \
  --bootstrap-server <KAFKA_IP>:9092 --partitions 2 --replication-factor 1

# 2. 在 EMR Master 上安装 Kafka connector
cp /usr/lib/flink/opt/flink-sql-connector-kafka-3.4.0.jar /usr/lib/flink/lib/

# 3. 启动 Flink YARN Session
flink-yarn-session -d -n 1 -s 1 -tm 2048 -jm 1024

# 4. 修改 SQL 中的 Kafka 地址并提交
sed -i "s|KAFKA_BOOTSTRAP_PLACEHOLDER|<KAFKA_IP>:9092|g" flink-35886-reproduce.sql
/usr/lib/flink/bin/sql-client.sh -f flink-35886-reproduce.sql

# 5. 在 Kafka EC2 上运行数据生产者
pip3 install kafka-python-ng
python3 produce-35886.py <KAFKA_IP>:9092

# 6. 检查结果
#    - Flink Web UI → Metrics → numLateRecordsDropped > 0 = Bug 复现
#    - taskmanager.out 中检查窗口输出是否缺少数据
```

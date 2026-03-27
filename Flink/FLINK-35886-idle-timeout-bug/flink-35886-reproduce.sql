-- ============================================================
-- FLINK-35886 复现: 水印对齐 + idle-timeout 误判
-- EMR 7.11.0 / Flink 1.20.0 (受影响版本 < 1.20.1)
--
-- 场景: 1个 Source subtask 读 2个 partition
--   Partition-0 (Split-A): 高速推进事件时间
--   Partition-1 (Split-B): 慢速推进后时间跳跃
--   Watermark Alignment maxDrift=30s → Split-A 被阻塞
--   idle-timeout=60s → 阻塞期间被错误计入 → Split-A 误判 IDLE
--   Split-B 时间跳跃 → 联合水印暴涨 → Split-A 数据被丢弃
-- ============================================================

SET 'table.exec.source.idle-timeout' = '60s';
SET 'parallelism.default' = '1';
SET 'pipeline.auto-watermark-interval' = '200ms';

CREATE TABLE order_events (
    order_id STRING,
    event_ts BIGINT,
    amount DOUBLE,
    ts AS TO_TIMESTAMP_LTZ(event_ts * 1000, 3),
    WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'order_events',
    'properties.bootstrap.servers' = 'KAFKA_BOOTSTRAP_PLACEHOLDER',
    'properties.group.id' = 'flink-35886-test',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json',
    'scan.watermark.alignment.group' = 'alignment-group-1',
    'scan.watermark.alignment.max-drift' = '30s',
    'scan.watermark.alignment.update-interval' = '1s'
);

CREATE TABLE result_sink (
    window_start TIMESTAMP(3),
    window_end TIMESTAMP(3),
    total_orders BIGINT,
    total_amount DOUBLE
) WITH (
    'connector' = 'print'
);

CREATE TABLE late_events_sink (
    order_id STRING,
    event_ts BIGINT,
    amount DOUBLE
) WITH (
    'connector' = 'print'
);

INSERT INTO result_sink
SELECT
    TUMBLE_START(ts, INTERVAL '10' SECOND) AS window_start,
    TUMBLE_END(ts, INTERVAL '10' SECOND) AS window_end,
    COUNT(*) AS total_orders,
    SUM(amount) AS total_amount
FROM order_events
GROUP BY TUMBLE(ts, INTERVAL '10' SECOND);

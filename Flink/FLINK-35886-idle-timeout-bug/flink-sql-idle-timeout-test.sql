-- ============================================================
-- Flink SQL idle-timeout 测试脚本
-- EMR 7.11.0 / Flink 1.20.0 + MSK Serverless (IAM Auth)
-- 
-- 测试场景：3个 Kafka partition，其中 partition-2 停止发送数据
-- 观察 idle-timeout 是否生效，watermark 是否继续推进
-- ============================================================

-- 设置 idle-timeout
SET 'table.exec.source.idle-timeout' = '10s';
SET 'parallelism.default' = '3';

-- ============================================================
-- 1. 创建 Source 表 (从 MSK 读取)
-- ============================================================
CREATE TABLE kafka_source (
    event_id STRING,
    partition_id INT,
    event_value DOUBLE,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'flink-idle-test',
    'properties.bootstrap.servers' = 'boot-3uwzvjhh.c1.kafka-serverless.us-east-1.amazonaws.com:9098',
    'properties.security.protocol' = 'SASL_SSL',
    'properties.sasl.mechanism' = 'AWS_MSK_IAM',
    'properties.sasl.jaas.config' = 'software.amazon.msk.auth.iam.IAMLoginModule required;',
    'properties.sasl.client.callback.handler.class' = 'software.amazon.msk.auth.iam.IAMClientCallbackHandler',
    'scan.startup.mode' = 'latest-offset',
    'format' = 'json'
);

-- ============================================================
-- 2. 创建 Sink 表 (输出到 print 用于观察)
-- ============================================================
CREATE TABLE print_sink (
    window_start TIMESTAMP(3),
    window_end TIMESTAMP(3),
    partition_id INT,
    event_count BIGINT,
    avg_value DOUBLE
) WITH (
    'connector' = 'print'
);

-- ============================================================
-- 3. 窗口聚合查询 - 测试 idle-timeout
--    如果 idle-timeout 不生效，当某个 partition 无数据时
--    watermark 会被阻塞，窗口无法触发
-- ============================================================
INSERT INTO print_sink
SELECT
    TUMBLE_START(event_time, INTERVAL '30' SECOND) AS window_start,
    TUMBLE_END(event_time, INTERVAL '30' SECOND) AS window_end,
    partition_id,
    COUNT(*) AS event_count,
    AVG(event_value) AS avg_value
FROM kafka_source
GROUP BY
    TUMBLE(event_time, INTERVAL '30' SECOND),
    partition_id;

#!/bin/bash
# FLINK-35886 复现: EMR 上运行 Flink SQL + 收集结果
set -x

KAFKA_IP="$1"
BOOTSTRAP="${KAFKA_IP}:9092"

echo "=== 准备 SQL ==="
aws s3 cp s3://aws-logs-073090110765-us-east-1/flink-idle-test/flink-35886-reproduce.sql /tmp/flink-35886.sql
sed -i "s|KAFKA_BOOTSTRAP_PLACEHOLDER|${BOOTSTRAP}|g" /tmp/flink-35886.sql
cat /tmp/flink-35886.sql

echo "=== 确保 Kafka connector 已安装 ==="
cp /usr/lib/flink/opt/flink-sql-connector-kafka-3.4.0.jar /usr/lib/flink/lib/ 2>/dev/null || true

echo "=== Kill 旧 Flink sessions ==="
for APP in $(yarn application -list 2>/dev/null | grep flink | awk '{print $1}'); do
  yarn application -kill $APP 2>/dev/null
done
sleep 5

echo "=== 启动 Flink YARN Session (parallelism=1) ==="
flink-yarn-session -d -n 1 -s 1 -tm 2048 -jm 1024 2>&1 | tail -5
sleep 15

echo "=== 提交 Flink SQL ==="
/usr/lib/flink/bin/sql-client.sh -f /tmp/flink-35886.sql 2>&1 | tail -15

echo "=== Flink 作业已提交, 等待数据生产者完成 + 额外30s ==="
sleep 130

echo "=== 收集结果 ==="
APP_ID=$(yarn application -list -appStates RUNNING 2>/dev/null | grep flink | head -1 | awk '{print $1}')
echo "Flink App: $APP_ID"

# 从所有节点收集 taskmanager.out
echo ""
echo "=== PRINT SINK OUTPUT (窗口结果) ==="
for dir in /mnt/var/log/hadoop-yarn/containers/${APP_ID}*/; do
  for f in $(find "$dir" -name taskmanager.out 2>/dev/null); do
    echo "--- $f ---"
    cat "$f"
  done
done

echo ""
echo "=== METRICS: lateRecordsDropped ==="
# 通过 Flink REST API 查看
FLINK_URL=$(yarn application -status $APP_ID 2>/dev/null | grep "Tracking-URL" | awk '{print $NF}')
echo "Flink UI: $FLINK_URL"
if [ -n "$FLINK_URL" ]; then
  # 获取 job ID
  JOB_ID=$(curl -s "${FLINK_URL}/jobs" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['jobs'][0]['id'])" 2>/dev/null)
  echo "Job ID: $JOB_ID"
  
  # 获取 vertices
  curl -s "${FLINK_URL}/jobs/${JOB_ID}" 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin)
for v in data.get('vertices',[]):
    print(f\"  {v['name']}: status={v['status']}, parallelism={v['parallelism']}\")
" 2>/dev/null

  # 获取 watermark 和 late records metrics
  echo ""
  echo "=== WATERMARK METRICS ==="
  curl -s "${FLINK_URL}/jobs/${JOB_ID}/vertices" 2>/dev/null | python3 -c "
import sys,json
data = json.load(sys.stdin) if sys.stdin.readable() else {}
" 2>/dev/null || true

  # 直接查 metrics
  VERTICES=$(curl -s "${FLINK_URL}/jobs/${JOB_ID}" 2>/dev/null | python3 -c "import sys,json; [print(v['id']) for v in json.load(sys.stdin).get('vertices',[])]" 2>/dev/null)
  for VID in $VERTICES; do
    echo "--- Vertex: $VID ---"
    curl -s "${FLINK_URL}/jobs/${JOB_ID}/vertices/${VID}/subtasks/metrics?get=currentInputWatermark,numLateRecordsDropped,numRecordsIn" 2>/dev/null | python3 -c "
import sys,json
for m in json.load(sys.stdin):
    print(f\"  {m['id']}: {m.get('sum','N/A')}\")
" 2>/dev/null || true
  done
fi

echo ""
echo "=== IDLE/WATERMARK LOGS ==="
for dir in /mnt/var/log/hadoop-yarn/containers/${APP_ID}*/; do
  for f in $(find "$dir" -name taskmanager.log 2>/dev/null); do
    echo "--- $(basename $(dirname $f)) ---"
    grep -i -E "idle|WatermarkStatus|alignment|blocked|IDLE|watermark.*jump" "$f" 2>/dev/null | tail -20
  done
done

echo "=== DONE ==="

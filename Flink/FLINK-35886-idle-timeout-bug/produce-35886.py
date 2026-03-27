#!/usr/bin/env python3
"""FLINK-35886 复现: 精确控制 partition 的数据生产者"""
import json, time, sys
from kafka import KafkaProducer

BOOTSTRAP = sys.argv[1] if len(sys.argv) > 1 else "13.14.20.151:9092"
TOPIC = "order_events"

producer = KafkaProducer(
    bootstrap_servers=BOOTSTRAP,
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

def send(partition, msg):
    producer.send(TOPIC, value=msg, partition=partition)
    producer.flush()

print("=== Phase 1: Split-A fast (partition 0) ===")
for et in [1000, 1010, 1020, 1030, 1042]:
    send(0, {"order_id": f"A_{et}", "event_ts": et, "amount": float(et)})
    print(f"  A event_ts={et}")
    time.sleep(1)

send(1, {"order_id": "B1", "event_ts": 1000, "amount": 5.0})
print("  B1 event_ts=1000")
print("A wm~1037, B wm~995, drift=42s>30s -> alignment blocks A")

print("\n=== Phase 2: Split-B slow 60s (A blocked) ===")
for i in range(1, 13):
    et = 1000 + i // 3
    send(1, {"order_id": f"B{i+1}", "event_ts": et, "amount": 1.0})
    print(f"  [+{4+i*5}s] B{i+1} et={et}")
    time.sleep(5)

print("\n~65s elapsed. Bug: A idle timer>60s -> IDLE")

print("\n=== Phase 3: Split-A data (may be dropped) ===")
for et in [1045, 1048, 1050, 1055, 1060]:
    send(0, {"order_id": f"A_{et}", "event_ts": et, "amount": float(et)})
    print(f"  A et={et}")

print("\n=== Phase 4: Split-B jump to 5000 ===")
send(1, {"order_id": "B_JUMP", "event_ts": 5000, "amount": 999.0})
time.sleep(2)
send(1, {"order_id": "B_JUMP2", "event_ts": 5001, "amount": 999.0})
print("  B et=5000,5001")

print("\nIf bug: watermark jumps ~1000->~4995, A data dropped!")
print("Waiting 30s...")
time.sleep(30)
print("=== DONE ===")
producer.close()

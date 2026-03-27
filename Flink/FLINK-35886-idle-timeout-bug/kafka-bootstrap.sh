#!/bin/bash
# Bootstrap: Install Kafka 2.8.1 on Amazon Linux 2023
set -ex

# Install Java 11
sudo yum install -y java-11-amazon-corretto-headless

# Download Kafka 2.8.1
cd /opt
sudo wget -q https://archive.apache.org/dist/kafka/2.8.1/kafka_2.13-2.8.1.tgz
sudo tar -xzf kafka_2.13-2.8.1.tgz
sudo ln -s kafka_2.13-2.8.1 kafka

# Get private IP
PRIVATE_IP=$(hostname -I | awk '{print $1}')

# Configure Kafka
cat <<EOF | sudo tee /opt/kafka/config/server.properties
broker.id=0
listeners=PLAINTEXT://${PRIVATE_IP}:9092
advertised.listeners=PLAINTEXT://${PRIVATE_IP}:9092
num.network.threads=3
num.io.threads=8
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
log.dirs=/tmp/kafka-logs
num.partitions=3
num.recovery.threads.per.data.dir=1
offsets.topic.replication.factor=1
transaction.state.log.replication.factor=1
transaction.state.log.min.isr=1
log.retention.hours=1
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
zookeeper.connect=localhost:2181
zookeeper.connection.timeout.ms=18000
EOF

# Start Zookeeper
sudo /opt/kafka/bin/zookeeper-server-start.sh -daemon /opt/kafka/config/zookeeper.properties
sleep 5

# Start Kafka
sudo /opt/kafka/bin/kafka-server-start.sh -daemon /opt/kafka/config/server.properties
sleep 5

# Create test topic with 3 partitions
/opt/kafka/bin/kafka-topics.sh --create --topic flink-idle-test \
  --bootstrap-server ${PRIVATE_IP}:9092 \
  --partitions 3 --replication-factor 1

echo "Kafka 2.8.1 started on ${PRIVATE_IP}:9092"
echo "Topic flink-idle-test created with 3 partitions"

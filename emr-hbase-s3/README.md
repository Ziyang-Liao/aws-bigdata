# EMR HBase on S3 标准化配置文档

> 经过实际集群创建和读写验证，确认该配置可在私有子网中正常运行 HBase on S3。

## 1. 集群概览

| 配置项 | 值 |
|--------|---|
| 集群名称 | HBase-S3-Recovery |
| EMR 版本 | emr-7.12.0 |
| 区域 | us-east-1 |
| 可用区 | us-east-1a |
| 自动终止 | 空闲 7200 秒 |
| 缩容行为 | TERMINATE_AT_TASK_COMPLETION |
| 异常节点替换 | 启用 |

## 2. 应用组件

| 组件 | 版本 |
|------|------|
| Hadoop | 3.4.1 |
| HBase | 2.6.2 |
| ZooKeeper | 3.9.3 |

## 3. 实例配置

| 节点类型 | 实例类型 | 数量 | 市场类型 |
|---------|---------|------|---------|
| Master | m5.2xlarge | 1 | ON_DEMAND |
| Core | m5.2xlarge | 3 | ON_DEMAND |

每个节点挂载 4 块 EBS 卷，每块 32GB gp2，共 128GB/节点。

## 4. HBase on S3 核心配置

```properties
# hbase classification
hbase.emr.storageMode = s3
hbase.emr.readreplica.enabled = false

# hbase-site classification
hbase.rootdir = s3://<BUCKET_NAME>/hbase/data
hbase.regionserver.handler.count = 100

# emrfs-site classification
fs.s3.maxConnections = 500
```

### 配置说明

| 参数 | 默认值 | 当前值 | 说明 |
|------|--------|--------|------|
| hbase.emr.storageMode | hdfs | s3 | HBase 数据存储在 S3，集群可销毁重建 |
| hbase.regionserver.handler.count | 30 | 100 | RegionServer RPC 处理线程数，适配高并发场景 |
| fs.s3.maxConnections | 50 | 500 | EMRFS 到 S3 的最大连接数，支撑高吞吐读写 |

## 5. IAM 角色

| 角色 | 值 | 用途 |
|------|---|------|
| Service Role | EMR_DefaultRole | EMR 服务调用 AWS API |
| EC2 Instance Profile | EMR_EC2_DefaultRole | EC2 节点访问 S3/CloudWatch 等 |

## 6. 网络配置

### 子网要求

- 使用**私有子网**（MapPublicIpOnLaunch: false）
- VPC 需启用 DNS Hostnames 和 DNS Support

### 安全组

| 安全组 | 名称 | 用途 |
|--------|------|------|
| Master SG | ElasticMapReduce-Master-Private | Master 节点入站/出站规则 |
| Slave SG | ElasticMapReduce-Slave-Private | Core/Task 节点入站/出站规则 |
| Service Access SG | ElasticMapReduce-ServiceAccess | EMR 服务通信（8443/9443） |

### 安全组规则要点

- Master ↔ Core：TCP/UDP 全端口 + ICMP 互通
- Service Access → Master/Core：仅 8443 出站
- Master ← Service Access：仅 9443 入站

## 7. 网络连通性要求（私有子网）

### 必需的 VPC Endpoints / 出站路径

| 服务 | 类型 | 必要性 | 说明 |
|------|------|--------|------|
| S3 | Gateway Endpoint | **必需** | HBase 数据读写，需关联到子网路由表 |
| DynamoDB | Gateway Endpoint | **必需** | EMRFS 一致性视图（如启用） |
| NAT Gateway | - | **必需** | EMR 控制面通信、CloudWatch 等 |
| STS | Interface Endpoint | 推荐 | IAM 角色认证 |
| EC2 | Interface Endpoint | 推荐 | 实例元数据操作 |
| EMR | Interface Endpoint | 可选 | 消除控制面公网依赖 |
| CloudWatch Logs | Interface Endpoint | 可选 | 消除日志推送公网依赖 |

### 路由表配置示例

| 目标 | 下一跳 |
|------|--------|
| VPC CIDR | local |
| 0.0.0.0/0 | NAT Gateway |
| S3 prefix list | S3 Gateway Endpoint |
| DynamoDB prefix list | DynamoDB Gateway Endpoint |

## 8. S3 存储结构

```
s3://<BUCKET_NAME>/
├── hbase/data/                    # HBase rootdir
│   ├── MasterData/                # HBase 系统表
│   │   ├── archive/
│   │   └── data/master/store/
│   └── data/default/              # 用户表数据
│       └── <table_name>/
│           ├── .tabledesc/        # 表元数据
│           └── <region_id>/       # Region 数据
│               ├── .regioninfo
│               └── <cf>/          # Column Family
│                   ├── .filelist/
│                   └── <hfile>    # HFile 数据文件
└── emr-logs/                      # EMR 集群日志
    └── <cluster_id>/
        ├── node/
        └── steps/
```

## 9. 验证结果

### 集群启动验证

- ✅ 私有子网启动成功（约 5 分钟就绪）
- ✅ 所有节点 IP 在私有子网 CIDR 范围内

### 数据读写验证

| 操作 | 结果 |
|------|------|
| create table | ✅ 建表成功 |
| put (写入) | ✅ 写入 2 行数据 |
| flush | ✅ 数据刷写到 S3 HFile |
| scan (全表扫描) | ✅ 返回 2 行 |
| get (单行查询) | ✅ 精确返回 |
| count | ✅ 计数正确 |

### 集群重建验证

- ✅ 旧集群终止后，新集群可直接读取旧表数据
- ✅ `list` 命令显示所有历史表（跨集群生命周期持久化）

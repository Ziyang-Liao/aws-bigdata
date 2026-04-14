# DS-06 RDS 实例自动发现

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
调用 RDS DescribeDBInstances + DescribeDBClusters，列出当前 AWS 账号内所有 RDS/Aurora 实例，用户可直接选择而非手动填写 host/port。选择后自动填充连接信息和 VPC 网络配置。

## 2. 用户故事
- 作为数据开发者，我希望从已有的 RDS 实例列表中选择数据源，避免手动输入容易出错的 endpoint 地址。

## 3. 交互设计
```
创建数据源 Step 2 连接配置:
┌──────────────────────────────────────────────┐
│ 连接方式:                                     │
│  ● 从 RDS 实例选择    ○ 手动输入              │
│                                               │
│ 🔍 发现 3 个 RDS 实例:                        │
│ ┌────────────────────────────────────────────┐│
│ │ ○ bgp-source-mysql                        ││
│ │   MySQL 8.0.44 | db.t3.micro | available  ││
│ │   VPC: vpc-0c02... | 私有子网              ││
│ ├────────────────────────────────────────────┤│
│ │ ○ analytics-pg                            ││
│ │   PostgreSQL 15.4 | db.r6g.large | available││
│ │   VPC: vpc-0c02... | 私有子网              ││
│ ├────────────────────────────────────────────┤│
│ │ ○ legacy-oracle (不同 VPC)                ││
│ │   Oracle 19c | db.m5.xlarge | available   ││
│ │   VPC: vpc-abc123 | ⚠️ 不同 VPC           ││
│ └────────────────────────────────────────────┘│
│                                               │
│ 选择后自动填充:                                │
│ 主机: bgp-source-mysql.xxx.rds.amazonaws.com  │
│ 端口: 3306                                    │
│ 引擎: MySQL                                   │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
GET /api/datasources/discover
Response: {
  instances: [
    {
      identifier: "bgp-source-mysql",
      engine: "mysql",
      engineVersion: "8.0.44",
      instanceClass: "db.t3.micro",
      endpoint: "bgp-source-mysql.cmjyssc8ul2m.us-east-1.rds.amazonaws.com",
      port: 3306,
      status: "available",
      vpcId: "vpc-0c0289626d1aa4620",
      subnetGroup: "bgp-rds-subnet-group",
      isCluster: false,
      isInPlatformVpc: true
    }
  ],
  clusters: [
    {
      identifier: "aurora-cluster-1",
      engine: "aurora-mysql",
      engineVersion: "8.0.mysql_aurora.3.04.0",
      readerEndpoint: "aurora-cluster-1-ro.xxx.rds.amazonaws.com",
      writerEndpoint: "aurora-cluster-1.xxx.rds.amazonaws.com",
      port: 3306,
      status: "available",
      vpcId: "vpc-0c0289626d1aa4620",
      isInPlatformVpc: true
    }
  ]
}
```

## 5. 数据模型
无新增持久化数据，实时查询 AWS API。

## 6. 后端实现方案
```
1. 调 RDS DescribeDBInstances()
   - 提取: DBInstanceIdentifier, Engine, EngineVersion, DBInstanceClass,
           Endpoint.Address, Endpoint.Port, DBInstanceStatus,
           DBSubnetGroup.VpcId
2. 调 RDS DescribeDBClusters()
   - 提取: DBClusterIdentifier, Engine, EngineVersion,
           Endpoint, ReaderEndpoint, Port, Status
3. 获取平台 VPC ID (从 bgp-settings 或 CDK 输出)
4. 标记每个实例是否在平台 VPC 内 (isInPlatformVpc)
5. 不同 VPC 的实例标记警告 (需要 VPC Peering 或 Transit Gateway)
6. 按 engine 分组排序返回
```

## 7. AWS 服务依赖
- RDS (DescribeDBInstances, DescribeDBClusters)

## 8. 安全考虑
- 仅返回实例元信息（endpoint/engine/VPC），不返回密码或敏感配置
- ECS Task Role 需要 rds:DescribeDBInstances, rds:DescribeDBClusters 权限
- 不同 VPC 的实例需要额外网络配置才能连接，前端明确提示

## 9. 验收标准
- [ ] 列出当前账号所有 RDS 实例和 Aurora 集群
- [ ] 显示引擎类型、版本、实例规格、状态
- [ ] 标记是否在平台 VPC 内
- [ ] 选择实例后自动填充 host/port/engine
- [ ] 不同 VPC 的实例显示警告提示
- [ ] 支持刷新实例列表

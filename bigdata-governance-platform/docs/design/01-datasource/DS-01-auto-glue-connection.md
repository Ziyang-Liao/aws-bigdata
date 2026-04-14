# DS-01 自动创建 Glue Connection

> 优先级: P0 | 模块: 数据源管理

## 1. 功能概述
用户保存数据源时，后端自动创建 AWS Glue JDBC Connection，包括自动拼接 JDBC URL、自动选择 VPC 私有子网、自动创建安全组。用户无需了解 Glue、VPC、安全组等 AWS 概念。

## 2. 用户故事
- 作为数据开发者，我希望只填写数据库地址和账号密码就能创建数据源，以便快速开始数据同步工作，不需要手动配置 AWS 底层资源。

## 3. 交互设计
```
创建数据源弹窗 Step 3 (测试 & 确认):
┌──────────────────────────────────────────────┐
│  正在初始化数据源资源...                        │
│                                               │
│  ✅ 密码加密存储    Secrets Manager 已创建      │
│  ✅ 网络配置        VPC: vpc-0c02... 子网: 私有  │
│  ✅ 安全组          sg-xxx (允许 3306 入站)      │
│  ✅ Glue Connection bgp-conn-01KMWQT7ZB 已创建  │
│  🔄 连接测试中...                               │
│                                               │
│  [取消]                              [完成]    │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources (增强)
Request: { name, type, host, port, database, username, password }
Response: {
  datasourceId: "xxx",
  status: "active",
  secretArn: "arn:aws:secretsmanager:...",
  glueConnectionName: "bgp-conn-xxx",
  networkConfig: {
    vpcId: "vpc-xxx",
    subnetId: "subnet-xxx",
    securityGroupId: "sg-xxx"
  },
  testResult: { networkReachable: true, authSuccess: true, latencyMs: 45 }
}
```

## 5. 数据模型
DynamoDB bgp-datasources 新增字段:
- secretArn: String (Secrets Manager ARN)
- glueConnectionName: String (自动生成)
- networkConfig: Map { vpcId, subnetId, securityGroupId }

## 6. 后端实现方案
```
1. 生成 JDBC URL:
   mysql    → jdbc:mysql://{host}:{port}/{database}
   postgresql → jdbc:postgresql://{host}:{port}/{database}
   oracle   → jdbc:oracle:thin:@{host}:{port}:{database}
   sqlserver → jdbc:sqlserver://{host}:{port};databaseName={database}

2. 创建 Secrets Manager Secret (bgp/datasource/{id})
3. 调 RDS DescribeDBInstances 匹配 host → 获取 VPC/子网
4. 创建安全组 (bgp-ds-{id}-sg), 添加入站规则: Glue SG → DB端口
5. 调 Glue CreateConnection:
   - ConnectionType: JDBC
   - ConnectionProperties: { JDBC_CONNECTION_URL, USERNAME, PASSWORD(从SM读) }
   - PhysicalConnectionRequirements: { SubnetId, SecurityGroupIdList, AvailabilityZone }
6. 调 Glue TestConnection 验证
7. 更新 DynamoDB 状态
```

## 7. AWS 服务依赖
- Glue (CreateConnection, TestConnection)
- Secrets Manager (CreateSecret)
- EC2 (CreateSecurityGroup, AuthorizeSecurityGroupIngress)
- RDS (DescribeDBInstances)

## 8. 安全考虑
- 密码不经过 DynamoDB，直接存 Secrets Manager
- 安全组最小权限：仅允许 Glue 安全组访问特定端口
- Glue Connection 密码引用 Secrets Manager ARN

## 9. 验收标准
- [ ] 用户只填 host/port/user/password，保存后自动创建 Glue Connection
- [ ] 安全组自动创建且仅开放对应数据库端口
- [ ] 连接测试自动执行并返回结果
- [ ] 删除数据源时自动清理 Glue Connection + 安全组 + Secret
- [ ] RDS 实例自动匹配 VPC，非 RDS 地址使用默认 VPC

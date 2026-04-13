# DS-03 自动配置网络

> 优先级: P0 | 模块: 数据源管理

## 1. 功能概述
自动检测 RDS 实例所在 VPC，找到私有子网，创建安全组并添加入站规则（允许 Glue 访问数据库端口）。非 RDS 地址使用平台默认 VPC。

## 2. 用户故事
- 作为数据开发者，我希望创建数据源时不需要手动配置 VPC、子网、安全组，系统自动处理网络连通性。

## 3. 交互设计
```
创建数据源 Step 2 连接配置:
┌──────────────────────────────────────────────┐
│ 主机地址: [bgp-source-mysql.xxx.rds.amazonaws.com]  │
│                                               │
│ 🔍 检测到 RDS 实例:                            │
│   VPC: vpc-0c0289626d1aa4620                  │
│   子网: subnet-00aed4243b32bc1ad (私有/us-east-1a) │
│   引擎: MySQL 8.0.44                          │
│   ✅ 网络将自动配置                             │
│                                               │
│ ⚙️ 高级网络设置 (可选)  [展开]                  │
└──────────────────────────────────────────────┘
```

## 4. API 设计
```
POST /api/datasources/detect-network
Request: { host: "xxx.rds.amazonaws.com" }
Response: {
  isRds: true,
  rdsInstance: {
    identifier: "bgp-source-mysql",
    engine: "mysql",
    engineVersion: "8.0.44",
    vpcId: "vpc-0c0289626d1aa4620",
    subnetIds: ["subnet-00aed...", "subnet-0aeef..."],
    securityGroupIds: ["sg-0c37f..."]
  },
  recommended: {
    subnetId: "subnet-00aed4243b32bc1ad",
    availabilityZone: "us-east-1a"
  }
}
```

## 5. 数据模型
bgp-datasources 新增: networkConfig: { vpcId, subnetId, securityGroupId, autoConfigured: boolean }

## 6. 后端实现方案
```
1. 解析 host 地址
2. 如果匹配 *.rds.amazonaws.com 模式:
   a. 调 RDS DescribeDBInstances，按 Endpoint.Address 匹配
   b. 获取 DBSubnetGroup → VPC ID + 子网列表
   c. 筛选私有子网 (MapPublicIpOnLaunch=false)
   d. 选择第一个私有子网
3. 如果非 RDS 地址:
   a. 从 bgp-settings 读取默认 VPC
   b. 使用默认私有子网
4. 创建安全组:
   a. CreateSecurityGroup(bgp-ds-{id}-sg, VPC)
   b. AuthorizeSecurityGroupIngress:
      - Source: Glue 安全组 (bgp-glue-sg)
      - Port: 根据数据库类型 (mysql:3306, pg:5432, oracle:1521, sqlserver:1433)
   c. Glue 安全组添加自引用规则 (如果不存在)
5. 返回网络配置信息
```

## 7. AWS 服务依赖
- RDS (DescribeDBInstances)
- EC2 (DescribeSubnets, CreateSecurityGroup, AuthorizeSecurityGroupIngress, DescribeSecurityGroups)

## 8. 安全考虑
- 安全组仅开放特定数据库端口，不开放全部端口
- 仅允许 Glue 安全组作为入站源，不允许 0.0.0.0/0
- 私有子网无公网 IP，数据不出 VPC

## 9. 验收标准
- [ ] RDS 地址自动检测 VPC 和子网
- [ ] 非 RDS 地址使用平台默认 VPC
- [ ] 安全组仅开放对应数据库端口
- [ ] 安全组入站源限定为 Glue 安全组
- [ ] 前端显示检测到的网络信息
- [ ] 支持用户手动覆盖自动检测的网络配置

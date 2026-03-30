# DS-06 RDS 实例自动发现

> 优先级: P1 | 模块: 数据源管理

## 1. 功能概述
调用 RDS DescribeDBInstances + DescribeDBClusters，列出账号内所有 RDS/Aurora 实例供用户选择，免手动填写 host/port。

## 2. 用户故事
- 作为数据开发者，我希望平台提供该功能，以便提升数据源管理的效率和安全性。

## 3. 交互设计
见功能概述中的描述。

## 4. API 设计
```
GET /api/datasources/discover\nResponse: {\n  instances: [{\n    identifier: 'bgp-source-mysql',\n    engine: 'mysql', version: '8.0.44',\n    endpoint: 'bgp-source-mysql.xxx.rds.amazonaws.com',\n    port: 3306, vpcId: 'vpc-xxx',\n    status: 'available', isCluster: false\n  }]\n}
```

## 5. 数据模型
无新增数据模型

## 6. 后端实现方案
```
GET /api/datasources/discover\nResponse: {\n  instances: [{\n    identifier: 'bgp-source-mysql',\n    engine: 'mysql', version: '8.0.44',\n    endpoint: 'bgp-source-mysql.xxx.rds.amazonaws.com',\n    port: 3306, vpcId: 'vpc-xxx',\n    status: 'available', isCluster: false\n  }]\n}
```

## 7. AWS 服务依赖
1. 调 RDS DescribeDBInstances\n2. 调 RDS DescribeDBClusters (Aurora)\n3. 合并结果，提取 endpoint/port/engine/VPC\n4. 按 engine 分组返回\n前端: 数据源表单中增加"从 RDS 选择"按钮，弹出实例列表，点击自动填充

## 8. 安全考虑
RDS (DescribeDBInstances, DescribeDBClusters)

## 9. 验收标准
- 仅返回实例元信息，不返回密码\nECS Task Role 需要 rds:Describe* 权限|[ ] 列出所有 RDS 实例和 Aurora 集群\n[ ] 点击实例自动填充 host/port/engine\n[ ] 显示实例状态和 VPC 信息

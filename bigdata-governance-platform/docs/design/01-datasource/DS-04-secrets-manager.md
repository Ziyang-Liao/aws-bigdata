# DS-04 密码加密存储

> 优先级: P0 | 模块: 数据源管理

## 1. 功能概述
密码存储到 AWS Secrets Manager 而非 DynamoDB。DynamoDB 仅存 secretArn 引用。创建时自动创建 Secret，删除时自动清理。

## 2. 用户故事
- 作为安全管理员，我希望数据库密码不以明文存储在 DynamoDB 中，以满足企业安全合规要求。

## 3. 交互设计
用户无感知，密码输入框不变。数据源详情中显示"密码存储: Secrets Manager ✅"。

## 4. API 设计
```
POST /api/datasources 内部流程变更:
1. 从 request body 提取 password
2. 创建 Secret: bgp/datasource/{datasourceId}
3. DynamoDB 存 secretArn，不存 password

GET /api/datasources/{id} 返回:
{ ..., secretArn: "arn:aws:secretsmanager:...", password: undefined }

需要密码时(如测试连接):
内部调 GetSecretValue 获取
```

## 5. 数据模型
bgp-datasources 变更:
- 移除: password 字段
- 新增: secretArn (String)

## 6. 后端实现方案
```
创建: SecretsManager.CreateSecret({
  Name: `bgp/datasource/${datasourceId}`,
  SecretString: JSON.stringify({ username, password }),
  Tags: [{ Key: "bgp:datasourceId", Value: datasourceId }]
})

读取: SecretsManager.GetSecretValue({ SecretId: secretArn })

更新密码: SecretsManager.UpdateSecret({ SecretId: secretArn, SecretString: ... })

删除: SecretsManager.DeleteSecret({ SecretId: secretArn, ForceDeleteWithoutRecovery: true })

迁移: 扫描现有数据源，将 password 字段迁移到 SM，更新 DynamoDB
```

## 7. AWS 服务依赖
- Secrets Manager (CreateSecret, GetSecretValue, UpdateSecret, DeleteSecret)

## 8. 安全考虑
- 密码全程加密存储，DynamoDB 无明文密码
- Secrets Manager 自动加密 (KMS)
- ECS Task Role 需要 secretsmanager:GetSecretValue 权限
- Secret 名称使用前缀 bgp/ 便于 IAM 策略限定范围

## 9. 验收标准
- [ ] 新建数据源密码存入 Secrets Manager
- [ ] DynamoDB 中无 password 字段，仅有 secretArn
- [ ] 测试连接时从 SM 读取密码
- [ ] 删除数据源时同步删除 Secret
- [ ] 现有数据源密码可迁移到 SM

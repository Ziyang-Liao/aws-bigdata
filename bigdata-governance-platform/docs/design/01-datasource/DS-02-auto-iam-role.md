# DS-02 自动创建/复用 IAM Role

> 优先级: P0 | 模块: 数据源管理

## 1. 功能概述
后端自动创建或复用 Glue ETL 所需的 IAM Role (bgp-glue-role)，附加最小权限策略。用户无需手动创建 IAM 角色。

## 2. 用户故事
- 作为平台管理员，我希望系统自动管理 Glue 所需的 IAM 权限，以便开发者无需了解 IAM 策略即可使用数据同步功能。

## 3. 交互设计
无独立 UI，在系统设置页显示当前 Glue Role ARN 和权限状态。

## 4. API 设计
```
内部调用，无独立 API。
在 POST /api/datasources 和 POST /api/sync 流程中自动检查/创建。

GET /api/settings/glue-role
Response: {
  roleArn: "arn:aws:iam::470377450205:role/bgp-glue-role",
  exists: true,
  policies: ["AWSGlueServiceRole", "bgp-s3-access", "bgp-secrets-read"]
}
```

## 5. 数据模型
系统设置表 bgp-settings (新增):
- PK: "system", SK: "glue-role"
- roleArn: String
- createdAt: String

## 6. 后端实现方案
```
1. 调 IAM GetRole("bgp-glue-role")
2. 如果存在 → 直接返回 ARN
3. 如果不存在 → 创建:
   a. CreateRole:
      Trust Policy: { Service: "glue.amazonaws.com" → sts:AssumeRole }
   b. AttachRolePolicy: AWSGlueServiceRole
   c. PutRolePolicy (内联策略 bgp-glue-custom):
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject","s3:PutObject","s3:ListBucket"],
        "Resource": ["arn:aws:s3:::bgp-*"]
      },
      {
        "Effect": "Allow",
        "Action": ["secretsmanager:GetSecretValue"],
        "Resource": ["arn:aws:secretsmanager:*:*:secret:bgp/*"]
      },
      {
        "Effect": "Allow",
        "Action": ["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],
        "Resource": ["arn:aws:logs:*:*:/aws-glue/*"]
      },
      {
        "Effect": "Allow",
        "Action": ["redshift-data:ExecuteStatement","redshift-data:DescribeStatement","redshift-data:GetStatementResult"],
        "Resource": "*"
      }
4. 等待角色可用 (IAM 传播延迟 ~10s)
5. 存入 bgp-settings
```

## 7. AWS 服务依赖
- IAM (GetRole, CreateRole, AttachRolePolicy, PutRolePolicy)

## 8. 安全考虑
- 最小权限原则：S3 仅限 bgp-* 前缀 bucket
- Secrets Manager 仅限 bgp/* 前缀
- 不授予 IAM 管理权限
- Role 信任策略仅允许 Glue 服务

## 9. 验收标准
- [ ] 首次使用时自动创建 bgp-glue-role
- [ ] 角色已存在时直接复用，不重复创建
- [ ] 权限策略符合最小权限原则
- [ ] 系统设置页可查看当前 Role ARN 和权限列表

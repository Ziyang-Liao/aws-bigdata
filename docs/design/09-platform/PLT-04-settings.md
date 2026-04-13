# PLT-04 系统设置页面

> 优先级: P1 | 模块: 平台基础

## 1. 功能概述
管理员设置页面 /admin/settings。全局配置：AWS Region、默认 VPC ID、默认私有子网、Glue IAM Role ARN、Glue 脚本 S3 Bucket、数据湖 S3 Bucket、MWAA DAG Bucket、Redshift 默认 Workgroup。存储：DynamoDB bgp-settings 表（PK: 'system', SK: configKey）。前端：表单展示所有配置项，Admin 可修改保存。VPC/子网/Bucket 等支持下拉选择（从 AWS API 动态获取）。服务状态检查面板（见 PLT-05）。

## 2. 用户故事
- 作为平台用户，我希望平台提供该功能，以便高效完成日常数据开发和运维工作。

## 3. 交互设计
详见功能概述中的前端描述。基于 Ant Design + Next.js 实现。

## 4. API 设计
详见功能概述中的 API 描述。遵循 RESTful 规范。

## 5. 数据模型
详见功能概述中的数据模型描述。

## 6. 后端实现方案
详见功能概述中的后端描述。

## 7. AWS 服务依赖
根据功能涉及的 AWS 服务（详见功能概述）。

## 8. 安全考虑
- 遵循最小权限原则
- 敏感数据加密存储和传输
- 操作权限控制
- 输入校验防注入

## 9. 验收标准
- [ ] 功能按设计实现并通过端到端测试
- [ ] 前端交互流畅，错误提示清晰
- [ ] API 返回格式规范
- [ ] 与现有功能无冲突

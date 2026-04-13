# MON-04 通知渠道管理

> 优先级: P0 | 模块: 任务监控

## 1. 功能概述
管理通知渠道：邮件（SNS Topic → Email Subscription）、企业微信 Webhook、钉钉 Webhook、Slack Webhook。渠道管理页面：添加/测试/删除渠道。DynamoDB 新表 bgp-alert-channels（PK: userId, SK: channelId）。字段：name, type, config:{webhookUrl/email/topicArn}, enabled。前端：渠道列表+新建弹窗，"测试"按钮发送测试消息验证渠道可用。后端：根据渠道类型调用对应 API（SNS Publish / HTTP POST Webhook）。通知模板：任务名、状态、耗时、错误信息、时间。

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

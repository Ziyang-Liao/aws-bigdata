# 灯效控制 Agent Demo

基于 Strands Agents SDK (TypeScript) + Bedrock AgentCore 的智能灯效控制 Demo。

## 架构

```
用户自然语言输入
       │
       ▼ (AgentCore InvokeAgentRuntime API)
┌──────────────────────────────┐
│  Bedrock AgentCore Runtime   │  ← 托管容器，自动伸缩
│  ┌────────────────────────┐  │
│  │  Strands Agent          │  │  ← Bedrock Claude 推理
│  │  ┌──────────────────┐  │  │
│  │  │ toggle_light     │  │  │  开灯 / 关灯
│  │  │ set_brightness   │  │  │  亮度调整 (0-100)
│  │  │ set_color        │  │  │  颜色调整 (名称/HEX)
│  │  └──────────────────┘  │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
       │
       ▼ 模拟 MCP 响应
  返回设备状态 JSON
```

## 本地测试

```bash
npm install --legacy-peer-deps
npm run demo          # 纯本地脚本测试
```

## 部署到 AgentCore

```bash
# 1. 构建 arm64 镜像并推送 ECR
docker buildx build --platform linux/arm64 \
  --tag <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/light-control-agent:latest \
  --push .

# 2. 创建 AgentCore Runtime
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name light_control_agent \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<IMAGE_URI>"}}' \
  --role-arn <ROLE_ARN> \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP

# 3. 调用测试
npx tsx src/invoke.ts
```

## 测试结果

```
📝 用户: 帮我把客厅的灯打开
🤖 助手: 已经为您打开客厅的灯了！当前亮度为50%，颜色为白色。
💡 设备: {"power":true,"brightness":50,"color":"#FFFFFF"}

📝 用户: 把亮度调到80
🤖 助手: 已将亮度调整到80%。
💡 设备: {"power":true,"brightness":80,"color":"#FFFFFF"}

📝 用户: 换成暖白色
🤖 助手: 已为您切换到暖白色灯光！
💡 设备: {"power":true,"brightness":50,"color":"#FFD700"}

📝 用户: 关灯
🤖 助手: 已为您关闭灯光。
💡 设备: {"power":false,"brightness":50,"color":"#FFFFFF"}
```

## 前置条件

- Node.js 20+
- Docker (buildx, arm64 支持)
- AWS 凭证（Bedrock Claude 模型访问权限）
- ECR 仓库

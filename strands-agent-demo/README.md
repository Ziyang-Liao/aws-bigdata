# 灯效控制 Agent Demo — Strands Agents + Bedrock AgentCore

基于 Strands Agents SDK (TypeScript) + Amazon Bedrock AgentCore Runtime 的智能灯效控制 Demo。

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. 模块详解](#2-模块详解)
- [3. 前置条件](#3-前置条件)
- [4. 本地开发与测试](#4-本地开发与测试)
- [5. 部署到 AgentCore](#5-部署到-agentcore)
- [6. 调用验证](#6-调用验证)
- [7. 模型切换](#7-模型切换)
- [8. 常见问题](#8-常见问题)

---

## 1. 架构概览

```
用户自然语言输入 (例: "帮我把灯打开")
       │
       ▼  AWS SDK: InvokeAgentRuntimeCommand
┌──────────────────────────────────────────┐
│  Amazon Bedrock AgentCore Runtime        │  ← AWS 托管容器，自动伸缩
│  ┌────────────────────────────────────┐  │
│  │  Express HTTP Server (index.ts)    │  │  ← /ping + /invocations
│  │  ┌──────────────────────────────┐  │  │
│  │  │  Strands Agent               │  │  │  ← Agent Loop: 推理→选工具→执行→返回
│  │  │  Model: Bedrock Claude       │  │  │
│  │  │  ┌────────────────────────┐  │  │  │
│  │  │  │ Tool 1: toggle_light  │  │  │  │  开灯 / 关灯
│  │  │  │ Tool 2: set_brightness│  │  │  │  亮度 0-100
│  │  │  │ Tool 3: set_color     │  │  │  │  颜色名称/HEX
│  │  │  └────────────────────────┘  │  │  │
│  │  └──────────────────────────────┘  │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
       │
       ▼
  JSON 响应 (助手回复 + 设备状态)
```

---

## 2. 模块详解

### 2.1 项目结构

```
strands-agent-demo/
├── src/
│   ├── tools.ts      # Tool 定义层 — 3 个灯效控制技能
│   ├── index.ts      # 服务层 — Express HTTP 服务 (AgentCore 入口)
│   ├── demo.ts       # 本地测试 — 纯脚本直接调用 Agent
│   └── invoke.ts     # 远程测试 — 通过 AgentCore API 调用
├── Dockerfile        # 容器镜像 (arm64, Node 20)
├── package.json      # 依赖管理
├── tsconfig.json     # TypeScript 配置
└── README.md         # 本文档
```

### 2.2 tools.ts — Tool 定义层

定义了 3 个自定义 Tool（Skill），每个 Tool 模拟 MCP 设备响应。

```typescript
// Tool 定义结构
const myTool = tool({
  name: "tool_name",           // 工具名称，LLM 通过名称选择工具
  description: "...",          // 工具描述，LLM 根据描述判断何时使用
  inputSchema: z.object({...}),// Zod Schema，定义输入参数及校验规则
  callback: (input) => {...},  // 执行函数，接收校验后的输入，返回结果
});
```

| Tool | 功能 | 输入参数 | 模拟 MCP 响应 |
|------|------|----------|---------------|
| `toggle_light` | 开灯/关灯 | `action: "on" \| "off"` | `{mcp_device, mcp_action, mcp_status, state}` |
| `set_brightness` | 亮度调整 | `brightness: 0-100` | 同上，调亮度时自动开灯 |
| `set_color` | 颜色调整 | `color: string` | 支持颜色名称(red/warm_white等)和HEX码 |

`deviceState` 是一个内存中的模拟设备状态对象：

```typescript
const deviceState = { power: false, brightness: 50, color: "#FFFFFF" };
```

### 2.3 index.ts — Express HTTP 服务层

AgentCore Runtime 要求容器暴露两个 HTTP 端点：

| 端点 | 方法 | 用途 | 说明 |
|------|------|------|------|
| `/ping` | GET | 健康检查 | AgentCore 定期调用，返回 `"ok"` 即可 |
| `/invocations` | POST | Agent 调用入口 | 接收二进制 payload，解码为文本后传给 Agent |

请求/响应流程：

```
AgentCore → POST /invocations (binary payload)
         → TextDecoder 解码为用户文本
         → agent.invoke(prompt)
         → Agent Loop: LLM 推理 → 选择 Tool → 执行 → 返回
         → JSON 响应 { response, deviceState }
```

关键配置：
- `printer: false` — 禁用控制台输出（容器环境不需要）
- `PORT = process.env.PORT || 8080` — AgentCore 默认使用 8080 端口

### 2.4 demo.ts — 本地测试脚本

不依赖 AgentCore，直接在本地创建 Agent 实例并调用。用于开发阶段快速验证 Tool 逻辑。

### 2.5 invoke.ts — AgentCore 远程调用脚本

通过 `@aws-sdk/client-bedrock-agentcore` 的 `InvokeAgentRuntimeCommand` 调用已部署的 AgentCore Runtime。

关键参数：
- `agentRuntimeArn` — AgentCore Runtime 的 ARN
- `runtimeSessionId` — 会话 ID（≥33 字符）
- `qualifier: "DEFAULT"` — 使用默认版本
- `payload` — 用户输入文本（TextEncoder 编码为二进制）

### 2.6 Dockerfile — 容器镜像

```dockerfile
FROM --platform=linux/arm64 node:20-slim  # AgentCore 要求 arm64 架构
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --legacy-peer-deps         # legacy-peer-deps 解决依赖冲突
COPY src/ ./src/
RUN npm run build                          # TypeScript → JavaScript
EXPOSE 8080                                # AgentCore 默认端口
CMD ["npm", "start"]                       # 启动 Express 服务
```

> ⚠️ AgentCore 仅支持 **arm64** 架构，使用 amd64 会报 `Architecture incompatible` 错误。

### 2.7 Strands Agent 核心概念

**Agent Loop（智能体循环）**：

```
用户输入 → LLM 推理 → 是否需要工具？
                         ├─ 是 → 选择工具 → 执行工具 → 将结果反馈给 LLM → 继续推理
                         └─ 否 → 生成最终回复
```

Agent 构造参数：

```typescript
const agent = new Agent({
  tools: [...],        // 可用工具列表
  systemPrompt: "...", // 系统提示词，定义 Agent 角色和行为
  model: bedrockModel, // 可选，指定模型（默认 Claude Sonnet 4）
  printer: false,      // 可选，禁用控制台输出
});
```

---

## 3. 前置条件

### 3.1 环境要求

- Node.js 20+
- Docker Desktop（需启用 buildx 和 arm64 模拟）
- AWS CLI v2
- 一个 AWS 账号

### 3.2 AWS 权限

你的 IAM 用户/角色需要以下权限：

- `bedrock:InvokeModel` — 调用 Bedrock 模型
- `bedrock-agentcore-control:*` — 管理 AgentCore Runtime
- `bedrock-agentcore:InvokeAgentRuntime` — 调用 Agent
- `ecr:*` — 推送 Docker 镜像
- `iam:CreateRole` / `iam:PutRolePolicy` — 创建 IAM 角色

### 3.3 Bedrock 模型访问

需要在 Bedrock 控制台开启模型访问：

1. 打开 [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. 左侧菜单 → **Model access**
3. 点击 **Manage model access**
4. 勾选 **Anthropic → Claude Sonnet 4** (或你想用的模型)
5. 点击 **Save changes**

---

## 4. 本地开发与测试

### 4.1 初始化项目

```bash
git clone https://github.com/Ziyang-Liao/aws-bigdata.git
cd aws-bigdata/strands-agent-demo
```

### 4.2 安装依赖

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` 是必须的，因为 `@strands-agents/sdk` 的 peer dependencies 之间有版本冲突。

### 4.3 配置 AWS 凭证

```bash
# 方式一：环境变量
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_REGION=us-east-1

# 方式二：AWS CLI 配置
aws configure
```

### 4.4 运行本地测试

```bash
npm run demo
# 或
npx tsx src/demo.ts
```

预期输出：

```
🔦 灯效控制 Agent Demo
========================================

📝 用户: 帮我把客厅的灯打开
🔧 Tool #1: toggle_light  ✓
🤖 助手: 已帮您打开客厅的灯！当前亮度为50%，颜色为白色。
💡 设备状态: {"power":true,"brightness":50,"color":"#FFFFFF"}
...
```

### 4.5 本地 Docker 测试

```bash
# 构建
docker build -t light-agent .

# 运行
docker run -p 8080:8080 \
  -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  -e AWS_REGION=us-east-1 \
  light-agent

# 另一个终端测试
curl http://localhost:8080/ping
# 输出: ok

echo -n "帮我开灯" | curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/octet-stream" --data-binary @-
```

---

## 5. 部署到 AgentCore

### 5.1 设置环境变量

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_REPO=light-control-agent
export RUNTIME_NAME=light_control_agent
```

### 5.2 创建 ECR 仓库

```bash
aws ecr create-repository \
  --repository-name $ECR_REPO \
  --region $AWS_REGION
```

### 5.3 构建并推送 arm64 镜像

```bash
# 登录 ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 构建 arm64 镜像并推送（使用 buildx）
docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push .
```

> 如果 `docker buildx` 不可用，先执行 `docker buildx create --use`。

### 5.4 创建 AgentCore IAM 角色

```bash
# 创建角色
aws iam create-role \
  --role-name BedrockAgentCoreRuntimeRole \
  --assume-role-policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{
      \"Effect\":\"Allow\",
      \"Principal\":{\"Service\":\"bedrock-agentcore.amazonaws.com\"},
      \"Action\":\"sts:AssumeRole\",
      \"Condition\":{
        \"StringEquals\":{\"aws:SourceAccount\":\"$ACCOUNT_ID\"},
        \"ArnLike\":{\"aws:SourceArn\":\"arn:aws:bedrock-agentcore:$AWS_REGION:$ACCOUNT_ID:*\"}
      }
    }]
  }"

# 附加权限策略
aws iam put-role-policy \
  --role-name BedrockAgentCoreRuntimeRole \
  --policy-name AgentCorePolicy \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],
        \"Resource\":\"arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/*\"
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":\"ecr:GetAuthorizationToken\",
        \"Resource\":\"*\"
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"bedrock:InvokeModel\",\"bedrock:InvokeModelWithResponseStream\"],
        \"Resource\":[\"arn:aws:bedrock:*::foundation-model/*\",\"arn:aws:bedrock:$AWS_REGION:$ACCOUNT_ID:*\"]
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\",\"logs:DescribeLogGroups\",\"logs:DescribeLogStreams\"],
        \"Resource\":\"*\"
      }
    ]
  }"

# 获取角色 ARN
export ROLE_ARN=$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)
echo "Role ARN: $ROLE_ARN"
```

### 5.5 创建 AgentCore Runtime

```bash
export IMAGE_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name $RUNTIME_NAME \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION
```

输出示例：

```json
{
    "agentRuntimeArn": "arn:aws:bedrock-agentcore:us-east-1:073090110765:runtime/light_control_agent-XXXXXXXXXX",
    "agentRuntimeId": "light_control_agent-XXXXXXXXXX",
    "status": "CREATING"
}
```

记下 `agentRuntimeId`。

### 5.6 等待 Runtime 就绪

```bash
export RUNTIME_ID=light_control_agent-XXXXXXXXXX  # 替换为实际 ID

# 轮询状态
watch -n 5 "aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --region $AWS_REGION \
  --query 'status' --output text"
```

状态变为 `READY` 即可（通常 30 秒内）。

### 5.7 查看日志（如果 FAILED）

```bash
aws logs tail "/aws/bedrock-agentcore/runtimes/$RUNTIME_ID-DEFAULT" \
  --region $AWS_REGION --since 5m
```

---

## 6. 调用验证

### 6.1 修改 invoke.ts 中的 ARN

编辑 `src/invoke.ts`，将 `RUNTIME_ARN` 替换为你的实际 ARN：

```typescript
const RUNTIME_ARN = "arn:aws:bedrock-agentcore:us-east-1:<ACCOUNT_ID>:runtime/<RUNTIME_ID>";
```

### 6.2 安装调用依赖

```bash
npm install @aws-sdk/client-bedrock-agentcore --legacy-peer-deps
```

### 6.3 执行测试

```bash
npx tsx src/invoke.ts
```

预期输出：

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

---

## 7. 模型切换

默认使用 Bedrock Claude Sonnet 4。可以切换为其他模型。

### 7.1 切换 Bedrock 模型

编辑 `src/index.ts`（或 `src/demo.ts`），导入 `BedrockModel` 并指定模型 ID：

```typescript
import { Agent, BedrockModel } from "@strands-agents/sdk";

// Claude Haiku (更快更便宜)
const model = new BedrockModel({
  modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
  region: "us-east-1",
});

// 或 Claude Opus (更强)
const model = new BedrockModel({
  modelId: "anthropic.claude-sonnet-4-20250514-v1:0",
  region: "us-east-1",
  temperature: 0.3,  // 可选，控制随机性
});

// 或 Amazon Nova
const model = new BedrockModel({
  modelId: "amazon.nova-pro-v1:0",
  region: "us-east-1",
});

const agent = new Agent({
  model: model,  // ← 传入自定义模型
  tools: [toggleLight, setBrightness, setColor],
  systemPrompt: "...",
});
```

### 7.2 常用 Bedrock 模型 ID

| 模型 | Model ID | 特点 |
|------|----------|------|
| Claude Sonnet 4 | `anthropic.claude-sonnet-4-20250514-v1:0` | 默认，均衡 |
| Claude Sonnet 4 (全球) | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | 跨区域推理 |
| Claude Haiku 3.5 | `anthropic.claude-3-5-haiku-20241022-v1:0` | 快速低成本 |
| Amazon Nova Pro | `amazon.nova-pro-v1:0` | AWS 自研 |
| Amazon Nova Lite | `amazon.nova-lite-v1:0` | 轻量快速 |

### 7.3 切换后重新部署

```bash
# 重新构建并推送
docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push --no-cache .

# 更新 AgentCore Runtime
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id "$RUNTIME_ID" \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION

# 等待 READY
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --region $AWS_REGION --query 'status'
```

### 7.4 使用非 Bedrock 模型（OpenAI 等）

```bash
npm install @strands-agents/openai --legacy-peer-deps
```

```typescript
import { OpenAIModel } from "@strands-agents/openai";

const model = new OpenAIModel({
  modelId: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
});

const agent = new Agent({ model, tools: [...] });
```

---

## 8. 常见问题

### Architecture incompatible

```
ValidationException: Architecture incompatible. Supported architectures: [arm64]
```

**原因**：AgentCore 仅支持 arm64。
**解决**：Dockerfile 第一行改为 `FROM --platform=linux/arm64 ...`，用 `docker buildx build --platform linux/arm64` 构建。

### ERR_MODULE_NOT_FOUND

```
Cannot find package '@modelcontextprotocol/sdk'
Cannot find package '@opentelemetry/api'
```

**原因**：`--legacy-peer-deps` 跳过了 Strands SDK 的 peer dependencies。
**解决**：显式安装缺失的包：

```bash
npm install @modelcontextprotocol/sdk @opentelemetry/api @a2a-js/sdk --legacy-peer-deps
```

### runtimeSessionId 长度不足

```
Value at 'runtimeSessionId' failed to satisfy constraint: length >= 33
```

**解决**：Session ID 必须 ≥ 33 个字符：

```typescript
const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
```

### RuntimeClientError: 424

**原因**：容器启动失败。
**解决**：查看 CloudWatch 日志定位具体错误：

```bash
aws logs tail "/aws/bedrock-agentcore/runtimes/$RUNTIME_ID-DEFAULT" \
  --region $AWS_REGION --since 5m
```

### Access Denied (Bedrock)

**原因**：IAM 角色缺少 `bedrock:InvokeModel` 权限，或模型未开启访问。
**解决**：
1. 检查 IAM 策略是否包含 `bedrock:InvokeModel`
2. 在 Bedrock 控制台开启对应模型的访问权限

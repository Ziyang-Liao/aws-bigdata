# 灯效控制 Agent Demo — Tool vs Skill 对比

基于 Strands Agents SDK (Python) + Amazon Bedrock AgentCore Runtime。

同时展示 **Tool** 和 **Skill** 两种能力扩展方式的区别与协作。

---

## 目录

- [1. 架构概览](#1-架构概览)
- [2. Tool vs Skill 核心区别](#2-tool-vs-skill-核心区别)
- [3. 模块详解](#3-模块详解)
- [4. 前置条件](#4-前置条件)
- [5. 本地开发与测试](#5-本地开发与测试)
- [6. 部署到 AgentCore](#6-部署到-agentcore)
- [7. 调用验证](#7-调用验证)
- [8. 模型切换](#8-模型切换)
- [9. 常见问题](#9-常见问题)

---

## 1. 架构概览

```
用户: "帮我切换到电影模式"
       │
       ▼  InvokeAgentRuntime API
┌──────────────────────────────────────────────┐
│  Amazon Bedrock AgentCore Runtime            │
│  ┌────────────────────────────────────────┐  │
│  │  Strands Agent                         │  │
│  │                                        │  │
│  │  ┌─ Skill (AgentSkills Plugin) ─────┐  │  │
│  │  │ scene-mode/SKILL.md              │  │  │  ← 按需加载领域知识
│  │  │ "电影模式: 亮度20, 暖白色"        │  │  │
│  │  └──────────────────────────────────┘  │  │
│  │           │ 指导                       │  │
│  │           ▼                            │  │
│  │  ┌─ Tools ──────────────────────────┐  │  │
│  │  │ toggle_light(on)                 │  │  │  ← 执行具体操作
│  │  │ set_brightness(20)               │  │  │
│  │  │ set_color(warm_white)            │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
       │
       ▼
  "电影模式已设置！亮度20%，暖白光"
```

---

## 2. Tool vs Skill 核心区别

### 一句话总结

> **Tool 是手，Skill 是脑中的知识。**
> Tool 让 Agent 能"做事"，Skill 让 Agent 知道"怎么做"。

### 详细对比

| 维度 | Tool | Skill |
|------|------|-------|
| **本质** | 可执行的函数 | 可加载的指令集（知识包） |
| **定义方式** | Python `@tool` 装饰器 | `SKILL.md` 文件（YAML frontmatter + Markdown） |
| **何时生效** | 始终可用，Agent 随时可调用 | 按需激活，Agent 判断需要时才加载 |
| **占用 Token** | 工具签名始终在上下文中 | 仅名称+描述在 system prompt，完整指令按需加载 |
| **作用** | 执行单一原子操作 | 提供领域知识，指导 Agent 组合多个 Tool |
| **类比** | 锤子、螺丝刀（工具） | 装修手册（告诉你何时用什么工具） |

### 协作流程

```
用户: "切换到电影模式"
  │
  ▼ Agent 看到 system prompt 中有 scene-mode 技能
  │
  ▼ 调用 skills(skill_name="scene-mode")  ← Skill 激活
  │
  ▼ 获得完整指令: "电影模式 = 亮度20 + 暖白色"
  │
  ▼ 按指令依次调用:
      toggle_light(on)       ← Tool 执行
      set_brightness(20)     ← Tool 执行
      set_color(warm_white)  ← Tool 执行
  │
  ▼ "电影模式已设置！"
```

### 什么时候用 Tool，什么时候用 Skill？

| 场景 | 推荐 |
|------|------|
| 调用 API、读写数据库、操作硬件 | **Tool** |
| 简单的单步操作 | **Tool** |
| 复杂的多步骤流程指导 | **Skill** |
| 领域专家知识（场景配置、操作规范） | **Skill** |
| 需要动态加载/卸载的能力 | **Skill** |
| 多个 Tool 的编排逻辑 | **Skill** |

---

## 3. 模块详解

### 3.1 项目结构

```
strands-agent-demo/
├── tools.py                    # Tool 定义 — 3 个灯效控制工具
├── demo.py                     # 本地测试 — Tool + Skill 对比演示
├── server.py                   # AgentCore 服务 — Flask HTTP 入口
├── skills/
│   └── scene-mode/
│       └── SKILL.md            # Skill 定义 — 场景模式知识包
├── Dockerfile                  # 容器镜像 (arm64, Python 3.12)
├── requirements.txt            # 依赖
└── README.md                   # 本文档
```

### 3.2 tools.py — Tool 定义

使用 `@tool` 装饰器定义，Strands 自动从函数签名和 docstring 提取元数据：

```python
from strands import tool

@tool
def toggle_light(action: str) -> str:
    """Turn a light on or off.

    Args:
        action: 'on' to turn on, 'off' to turn off.
    """
    device_state["power"] = action == "on"
    return json.dumps({"mcp_status": "success", "state": device_state})
```

Strands 会自动生成：
- `name` ← 函数名 `toggle_light`
- `description` ← docstring 第一行
- `inputSchema` ← 函数参数 + Args 描述

### 3.3 skills/scene-mode/SKILL.md — Skill 定义

```markdown
---
name: scene-mode
description: 预设灯光场景模式，包括阅读模式、电影模式、派对模式等。
---
# 场景模式技能

| 场景 | 亮度 | 颜色 |
|------|------|------|
| 电影模式 | 20 | warm_white |
| 派对模式 | 100 | purple |
...
```

- YAML frontmatter 中的 `name` + `description` 注入到 system prompt
- Markdown 正文是完整指令，仅在 Agent 调用 `skills("scene-mode")` 时加载

### 3.4 demo.py — 本地测试

同时注册 Tool 和 Skill，运行 5 个测试用例：

```python
from strands import Agent, AgentSkills

skill_plugin = AgentSkills(skills="./skills/scene-mode")

agent = Agent(
    tools=[toggle_light, set_brightness, set_color],  # Tool
    plugins=[skill_plugin],                            # Skill
    system_prompt="...",
)
```

### 3.5 server.py — AgentCore HTTP 服务

Flask 实现 AgentCore 要求的两个端点：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/ping` | GET | 健康检查，返回 `"ok"` |
| `/invocations` | POST | Agent 调用入口 |

### 3.6 Dockerfile

```dockerfile
FROM --platform=linux/arm64 python:3.12-slim  # AgentCore 要求 arm64
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["python", "server.py"]
```

---

## 4. 前置条件

- Python 3.10+（本地开发）或 Docker（容器化测试）
- Docker Desktop（需 buildx + arm64 支持）
- AWS CLI v2
- Bedrock 模型访问权限（Claude Sonnet 4，在 Bedrock 控制台开启）

---

## 5. 本地开发与测试

### 5.1 克隆项目

```bash
git clone https://github.com/Ziyang-Liao/aws-bigdata.git
cd aws-bigdata/strands-agent-demo
```

### 5.2 安装依赖

```bash
pip install -r requirements.txt
```

### 5.3 配置 AWS 凭证

```bash
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_REGION=us-east-1
```

### 5.4 运行 Demo

```bash
python demo.py
```

预期输出：

```
🔦 灯效控制 Agent Demo — Tool + Skill 对比
==================================================

[Tool 直接调用] 📝 用户: 帮我把客厅的灯打开
Tool #1: toggle_light  ✓
💡 设备状态: {'power': True, 'brightness': 50, 'color': '#FFFFFF'}

[Tool 直接调用] 📝 用户: 把亮度调到80
Tool #2: set_brightness  ✓
💡 设备状态: {'power': True, 'brightness': 80, 'color': '#FFFFFF'}

[Skill 场景模式] 📝 用户: 帮我切换到电影模式
Tool #4: skills("scene-mode")  ← Skill 激活
Tool #5: toggle_light(on)
Tool #6: set_brightness(20)
Tool #7: set_color(warm_white)
💡 设备状态: {'power': True, 'brightness': 20, 'color': '#FFD700'}

[Skill 场景模式] 📝 用户: 我要开派对模式
Tool #8-#10: toggle → brightness(100) → color(purple)
💡 设备状态: {'power': True, 'brightness': 100, 'color': '#800080'}
```

### 5.5 Docker 本地测试

```bash
docker build -t light-agent .
docker run -p 8080:8080 \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION=us-east-1 \
  light-agent

# 另一个终端
curl http://localhost:8080/ping
echo -n "切换到电影模式" | curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/octet-stream" --data-binary @-
```

---

## 6. 部署到 AgentCore

### 6.1 环境变量

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_REPO=light-control-agent
```

### 6.2 创建 ECR 仓库

```bash
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION
```

### 6.3 构建 arm64 镜像并推送

```bash
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push .
```

### 6.4 创建 IAM 角色

```bash
aws iam create-role --role-name BedrockAgentCoreRuntimeRole \
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

aws iam put-role-policy --role-name BedrockAgentCoreRuntimeRole \
  --policy-name AgentCorePolicy \
  --policy-document "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[
      {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],\"Resource\":\"arn:aws:ecr:$AWS_REGION:$ACCOUNT_ID:repository/*\"},
      {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
      {\"Effect\":\"Allow\",\"Action\":[\"bedrock:InvokeModel\",\"bedrock:InvokeModelWithResponseStream\"],\"Resource\":[\"arn:aws:bedrock:*::foundation-model/*\",\"arn:aws:bedrock:$AWS_REGION:$ACCOUNT_ID:*\"]},
      {\"Effect\":\"Allow\",\"Action\":[\"logs:*\"],\"Resource\":\"*\"}
    ]
  }"

export ROLE_ARN=$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)
```

### 6.5 创建 AgentCore Runtime

```bash
export IMAGE_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name light_control_agent \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION
```

### 6.6 等待就绪

```bash
export RUNTIME_ID=light_control_agent-XXXXXXXXXX  # 替换为实际 ID

watch -n 5 "aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID --region $AWS_REGION --query status --output text"
# 等待输出 READY
```

---

## 7. 当前使用的模型

### 7.1 模型版本

本项目使用 **Claude Haiku 4.5**，通过 **跨区域推理（Cross-Region Inference）** 方式调用：

```
模型 ID: us.anthropic.claude-haiku-4-5-20251001-v1:0
```

代码中的配置（`server.py` / `demo.py`）：

```python
from strands.models.bedrock import BedrockModel

model = BedrockModel(
    model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
    region_name="us-east-1",
)
```

### 7.2 什么是跨区域推理？

模型 ID 前面的 `us.` 前缀表示使用 AWS 的**跨区域推理（Cross-Region Inference）**功能：

- **不加前缀**（如 `anthropic.claude-haiku-4-5-20251001-v1:0`）：请求只发到你指定的单个区域（如 us-east-1），如果该区域繁忙，可能排队等待
- **加 `us.` 前缀**：请求会自动路由到美国区域中最空闲的节点（us-east-1、us-west-2 等），减少排队延迟
- **加 `global.` 前缀**：路由范围更大（全球），但可能增加网络延迟

> 简单理解：`us.` 就像高速公路的 ETC 通道，自动选最短的队排。

### 7.3 为什么选 Haiku 4.5？

| 模型 | 单次 Tool 调用 | Skill 场景模式（4轮调用） | 适合场景 |
|------|---------------|------------------------|----------|
| Claude Sonnet 4.5（默认） | 8-10s | 15-20s | 复杂推理 |
| **Claude Haiku 4.5** | **2.5-3.5s** | **4.5-5.5s** | ✅ 本项目：简单工具调用 |
| Claude Haiku 3.5 | 2-3s | 4-5s | 更便宜但能力稍弱 |

灯效控制场景不需要复杂推理，Haiku 4.5 在速度和能力之间取得了最佳平衡。

---

## 8. 调用验证

部署完成后，有两种方式验证。

### 8.1 方式一：AWS CLI（最简单）

直接在终端执行，把引号里的中文换成你想测试的指令即可：

**测试 Tool — 开灯：**

```bash
echo -n '帮我开灯' | base64 | xargs -I{} aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn "arn:aws:bedrock-agentcore:us-east-1:073090110765:runtime/light_control_agent-5mGnjk7jwJ" \
  --runtime-session-id "test-$(date +%s)-padding-xxxxxxxxx" \
  --qualifier DEFAULT --payload '{}' --region us-east-1 /tmp/resp.json \
  && python3 -c "import json;d=json.load(open('/tmp/resp.json'));print(d['response']);print(d['deviceState'])"
```

**测试 Skill — 电影模式：**

```bash
echo -n '切换到电影模式' | base64 | xargs -I{} aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn "arn:aws:bedrock-agentcore:us-east-1:073090110765:runtime/light_control_agent-5mGnjk7jwJ" \
  --runtime-session-id "test-$(date +%s)-padding-xxxxxxxxx" \
  --qualifier DEFAULT --payload '{}' --region us-east-1 /tmp/resp.json \
  && python3 -c "import json;d=json.load(open('/tmp/resp.json'));print(d['response']);print(d['deviceState'])"
```

> **为什么要 base64？** AWS CLI 的 `--payload` 参数只接受 ASCII 字符，中文需要先 base64 编码。AgentCore 会自动解码。

> **`runtime-session-id` 为什么这么长？** AgentCore 要求 session ID 至少 33 个字符，`test-$(date +%s)-padding-xxxxxxxxx` 刚好满足。

### 8.2 方式二：Python 脚本

```python
import boto3, json

client = boto3.client("bedrock-agentcore", region_name="us-east-1")

prompt = "切换到电影模式"  # ← 改成你想测的指令

resp = client.invoke_agent_runtime(
    runtimeSessionId="test-session-" + "x" * 30,
    agentRuntimeArn="arn:aws:bedrock-agentcore:us-east-1:<ACCOUNT_ID>:runtime/<RUNTIME_ID>",
    qualifier="DEFAULT",
    payload=prompt.encode(),
)

data = json.loads(resp["response"].read().decode())
print("🤖", data["response"])
print("💡", data["deviceState"])
```

### 8.3 实际测试结果

以下是 Haiku 4.5 跨区域推理的实测结果：

```
🔦 灯效控制 Agent — Haiku 4.5 测试
=======================================================

[Tool] 📝 帮我把客厅的灯打开
🤖 好的！客厅的灯已经打开了。当前亮度为50%，颜色为白色。
💡 {'brightness': 50, 'color': '#FFFFFF', 'power': True}
⏱️  3.6s

[Tool] 📝 把亮度调到80
🤖 亮度已调至80%，灯光现在是中等偏亮的状态。
💡 {'brightness': 80, 'color': '#FFFFFF', 'power': True}
⏱️  2.5s

[Tool] 📝 换成暖白色
🤖 已为您切换到暖白色！
💡 {'brightness': 50, 'color': '#FFD700', 'power': True}
⏱️  3.5s

[Skill] 📝 切换到电影模式
🤖 ✨ 已成功切换到电影模式！暖白光色，亮度20%，完美的观影氛围！
💡 {'brightness': 20, 'color': '#FFD700', 'power': True}
⏱️  5.7s

[Skill] 📝 开派对模式
🤖 ✨ 派对模式已激活！亮度100%，紫色灯光，准备好嗨皮了！🎉
💡 {'brightness': 100, 'color': '#800080', 'power': True}
⏱️  4.9s

[Tool] 📝 关灯
🤖 灯已关闭。
💡 {'brightness': 50, 'color': '#FFFFFF', 'power': False}
⏱️  2.5s
```

---

## 9. 模型切换指南

如果你想换用其他模型，按以下步骤操作。

### 9.1 修改代码

编辑 `server.py`（和 `demo.py`），修改 `model_id`：

```python
from strands.models.bedrock import BedrockModel

# 当前使用：Haiku 4.5 跨区域推理（推荐）
model = BedrockModel(model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0", region_name="us-east-1")

# 或：Sonnet 4（更强但更慢）
model = BedrockModel(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0", region_name="us-east-1")

# 或：Amazon Nova Pro（AWS 自研）
model = BedrockModel(model_id="us.amazon.nova-pro-v1:0", region_name="us-east-1")

agent = Agent(model=model, tools=[...], plugins=[...])
```

### 9.2 常用模型 ID 速查表

| 模型 | 单区域 ID | 跨区域 ID（推荐） | 速度 | 能力 |
|------|-----------|-------------------|------|------|
| **Haiku 4.5** | `anthropic.claude-haiku-4-5-20251001-v1:0` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | ⚡⚡⚡ 最快 | ★★★ |
| Haiku 3.5 | `anthropic.claude-3-5-haiku-20241022-v1:0` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | ⚡⚡⚡ | ★★ |
| **Sonnet 4** | `anthropic.claude-sonnet-4-20250514-v1:0` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | ⚡⚡ | ★★★★ |
| Sonnet 4.5 | `anthropic.claude-sonnet-4-5-20250929-v1:0` | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | ⚡ | ★★★★★ |
| Nova Pro | `amazon.nova-pro-v1:0` | `us.amazon.nova-pro-v1:0` | ⚡⚡ | ★★★ |
| Nova Lite | `amazon.nova-lite-v1:0` | `us.amazon.nova-lite-v1:0` | ⚡⚡⚡ | ★★ |

> **选型建议**：简单工具调用场景用 Haiku 4.5，复杂推理场景用 Sonnet 4 或 4.5。

### 9.3 本地验证模型 ID 是否可用

修改代码前，先用这条命令验证模型 ID 是否正确、是否有访问权限：

```bash
python3 -c "
import boto3
client = boto3.client('bedrock-runtime', region_name='us-east-1')
resp = client.invoke_model(
    modelId='us.anthropic.claude-haiku-4-5-20251001-v1:0',
    body='{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":10,\"anthropic_version\":\"bedrock-2023-05-31\"}'
)
print(resp['body'].read().decode()[:200])
"
```

如果返回正常 JSON 响应，说明模型可用。如果报错 `AccessDeniedException`，需要在 Bedrock 控制台开启该模型的访问权限。

### 9.4 重新部署到 AgentCore

```bash
# 1. 重新构建镜像
docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push --no-cache .

# 2. 更新 AgentCore Runtime
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id "$RUNTIME_ID" \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION

# 3. 等待 READY（约 30 秒）
watch -n 5 "aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID --region $AWS_REGION --query status --output text"
```

---

## 10. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `Architecture incompatible` | AgentCore 仅支持 arm64 | Dockerfile 用 `--platform=linux/arm64`，buildx 构建 |
| `No matching distribution` | Python < 3.10 | 升级 Python 或用 Docker |
| Session ID 长度不足 | `runtimeSessionId` 需 ≥ 33 字符 | 用 `"test-$(date +%s)-padding-xxxxxxxxx"` |
| Skill 未激活 | system prompt 未提示使用 Skill | 在 system prompt 中明确提到"如果用户提到场景/模式，先激活技能" |
| RuntimeClientError 424 | 容器启动失败 | `aws logs tail /aws/bedrock-agentcore/runtimes/$RUNTIME_ID-DEFAULT` |
| CLI payload 中文报错 | `--payload` 只接受 ASCII | 用 `echo -n '中文' \| base64` 编码后传入 |
| `AccessDeniedException` | 模型未开启访问 | Bedrock 控制台 → Model access → 勾选对应模型 |
| 响应很慢（>10s） | 使用了默认 Sonnet 4.5 | 换成 Haiku 4.5 + `us.` 跨区域前缀 |

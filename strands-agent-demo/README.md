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

## 7. 调用验证

```python
import boto3, json

client = boto3.client("bedrock-agentcore", region_name="us-east-1")

for prompt in ["帮我开灯", "切换到电影模式", "开派对模式"]:
    resp = client.invoke_agent_runtime(
        runtimeSessionId="test-session-" + "x" * 30,
        agentRuntimeArn="arn:aws:bedrock-agentcore:us-east-1:<ACCOUNT>:runtime/<RUNTIME_ID>",
        qualifier="DEFAULT",
        payload=prompt.encode(),
    )
    body = json.loads(resp["response"].read().decode())
    print(f"📝 {prompt}")
    print(f"🤖 {body['response']}")
    print(f"💡 {body['deviceState']}\n")
```

---

## 8. 模型切换

### 8.1 修改代码

编辑 `server.py` 或 `demo.py`：

```python
from strands.models.bedrock import BedrockModel

# Claude Haiku (更快更便宜)
model = BedrockModel(model_id="anthropic.claude-3-5-haiku-20241022-v1:0", region_name="us-east-1")

# Amazon Nova Pro
model = BedrockModel(model_id="amazon.nova-pro-v1:0", region_name="us-east-1")

agent = Agent(model=model, tools=[...], plugins=[...])
```

### 8.2 常用模型 ID

| 模型 | Model ID | 特点 |
|------|----------|------|
| Claude Sonnet 4 | `anthropic.claude-sonnet-4-20250514-v1:0` | 默认，均衡 |
| Claude Haiku 3.5 | `anthropic.claude-3-5-haiku-20241022-v1:0` | 快速低成本 |
| Amazon Nova Pro | `amazon.nova-pro-v1:0` | AWS 自研 |

### 8.3 重新部署

```bash
docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push --no-cache .

aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION
```

---

## 9. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `Architecture incompatible` | AgentCore 仅支持 arm64 | Dockerfile 用 `--platform=linux/arm64`，buildx 构建 |
| `No matching distribution` | Python < 3.10 | 升级 Python 或用 Docker |
| Session ID 长度不足 | `runtimeSessionId` 需 ≥ 33 字符 | 生成更长的 session ID |
| Skill 未激活 | system prompt 未提示使用 Skill | 在 system prompt 中明确提到"如果用户提到场景/模式，先激活技能" |
| RuntimeClientError 424 | 容器启动失败 | `aws logs tail /aws/bedrock-agentcore/runtimes/$RUNTIME_ID-DEFAULT` |

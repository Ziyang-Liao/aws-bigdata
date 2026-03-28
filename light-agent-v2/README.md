# Light Agent V2 — 标准化 Strands Agent 实现

基于 Strands Agents SDK (Python) 的标准 Tool + Skill 架构，实现完整的多设备智能灯光控制。

这是 `light-assistant`（TypeScript/MCP Gateway 架构）的标准化重写版本，**全面使用 AgentCore 核心能力**。

---

## AgentCore 能力使用清单

| AgentCore 能力 | 状态 | 实现方式 |
|---|---|---|
| **Runtime** (BedrockAgentCoreApp) | ✅ | `@app.entrypoint` 标准入口，自动处理 /ping + /invocations |
| **Tool** (@tool) | ✅ | 4 个 `@tool` 装饰器函数，SDK 自动提取 schema |
| **Skill** (AgentSkills) | ✅ | 2 个 `SKILL.md` 知识包，按需加载 |
| **Memory** (AgentCore Memory) | ✅ | 跨会话记忆，记住用户偏好（如喜欢暖色调） |
| **Observability** (OTel) | ✅ | `opentelemetry-instrument` 自动链路追踪 → CloudWatch |
| **Identity/Credential** | — | 当前无外部 API 调用，无需凭证管理 |
| **MCP Gateway** | — | Tool 在本地执行，无需远程路由 |

---

## 与 light-assistant 的对比

| 维度 | light-assistant | light-agent-v2 (本项目) |
|------|----------------|------------------------|
| 语言 | TypeScript | Python |
| Tool 定义 | JSON Schema + Lambda | `@tool` 装饰器（SDK 自动提取） |
| Skill 机制 | ❌ 未使用（仅 Tool 分组） | ✅ 原生 `AgentSkills` + `SKILL.md` |
| Memory | ❌ 无（进程内存，重启丢失） | ✅ AgentCore Memory（跨会话持久化） |
| Observability | ❌ 无 | ✅ OTel 自动 instrumentation |
| Runtime 入口 | 自定义 Express | ✅ `BedrockAgentCoreApp` 标准入口 |
| 部署组件 | 7+ AWS 服务 | 1 个容器 |
| 代码量 | 数千行 | ~300 行 |

---

## 架构

```
用户: "帮我切换到圣诞主题"
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│  BedrockAgentCoreApp                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Strands Agent (Claude Haiku 4.5)                  │  │
│  │                                                    │  │
│  │  ┌─ AgentCore Memory ──────────────────────────┐   │  │
│  │  │ 短期记忆: 会话上下文                          │   │  │  ← 自动管理
│  │  │ 长期记忆: 用户偏好 (SEMANTIC/USER_PREFERENCE) │   │  │
│  │  └─────────────────────────────────────────────┘   │  │
│  │                                                    │  │
│  │  ┌─ Skill: scene-mode ────────────────────────┐    │  │
│  │  │ 6 预设主题 + 8 动态氛围配色表               │    │  │  ← 按需加载
│  │  └────────────────────────────────────────────┘    │  │
│  │  ┌─ Skill: device-discovery ──────────────────┐    │  │
│  │  │ 设备列表 + 中英文昵称映射表                 │    │  │  ← 按需加载
│  │  └────────────────────────────────────────────┘    │  │
│  │           │ 指导                                   │  │
│  │           ▼                                        │  │
│  │  ┌─ Tools ────────────────────────────────────┐    │  │
│  │  │ control_light    — 控制开关/亮度/颜色       │    │  │  ← 始终可用
│  │  │ query_lights     — 查询设备状态             │    │  │
│  │  │ discover_devices — 发现可用设备             │    │  │
│  │  │ resolve_device_name — 昵称解析              │    │  │
│  │  └────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Observability (OTel) ────────────────────────────┐   │
│  │ 自动追踪: Agent 推理 → Tool 调用 → 模型请求       │   │  ← 自动 instrument
│  │ 输出到: CloudWatch GenAI Observability Dashboard   │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
light-agent-v2/
├── server.py                       # BedrockAgentCoreApp 标准入口 + Memory 集成
├── demo.py                         # 本地测试 Demo
├── tools.py                        # 4 个 @tool 定义
├── devices.py                      # 设备模型 + 状态管理 + 昵称映射
├── skills/
│   ├── scene-mode/
│   │   └── SKILL.md                # 场景模式知识包 (6 预设 + 8 动态氛围)
│   └── device-discovery/
│       └── SKILL.md                # 设备发现知识包 (设备列表 + 昵称表)
├── Dockerfile                      # arm64 容器 + OTel auto-instrumentation
├── requirements.txt                # 含 bedrock-agentcore + otel 依赖
└── README.md
```

---

## 快速开始

### 本地运行

```bash
pip install -r requirements.txt
export AWS_REGION=us-east-1

# 运行 Demo（不需要 Memory）
python demo.py

# 或启动 AgentCore 标准服务
python server.py
```

### 启用 AgentCore Memory

```bash
# 1. 创建 Memory 资源
pip install bedrock-agentcore
python -c "
from bedrock_agentcore.memory import MemoryClient
client = MemoryClient(region_name='us-east-1')
mem = client.create_memory_and_wait(
    name='LightAgentMemory',
    description='Light agent user preferences and session history',
    strategies=[
        {'userPreferenceMemoryStrategy': {
            'name': 'PreferenceLearner',
            'namespaceTemplates': ['/preferences/{actorId}/']
        }},
        {'semanticMemoryStrategy': {
            'name': 'FactExtractor',
            'namespaceTemplates': ['/facts/{actorId}/']
        }}
    ]
)
print('Memory ID:', mem['id'])
"

# 2. 设置环境变量后启动
export AGENTCORE_MEMORY_ID=<上面输出的 Memory ID>
python server.py
```

### 启用 Observability

```bash
# 本地带 OTel 追踪运行
export AGENT_OBSERVABILITY_ENABLED=true
export OTEL_PYTHON_DISTRO=aws_distro
export OTEL_PYTHON_CONFIGURATOR=aws_configurator
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_RESOURCE_ATTRIBUTES=service.name=light-agent-v2

opentelemetry-instrument python server.py
```

部署到 AgentCore Runtime 后，OTel 自动启用（Dockerfile CMD 已配置 `opentelemetry-instrument`）。

### 部署到 AgentCore

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_REPO=light-agent-v2

# 创建 ECR + 构建推送
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push .

# 创建 Runtime
export ROLE_ARN=$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)
export IMAGE_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name light_agent_v2 \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region $AWS_REGION
```

---

## AgentCore 能力详解

### 1. BedrockAgentCoreApp（标准化入口）

替代手写 Flask，自动处理 AgentCore 服务契约：

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
def handle(payload: dict):
    result = agent(payload["prompt"])
    return {"response": str(result)}

app.run()  # 自动注册 /ping + /invocations
```

### 2. AgentCore Memory（跨会话记忆）

通过环境变量 `AGENTCORE_MEMORY_ID` 启用，Agent 自动获得：
- **短期记忆**：同一会话内的上下文保持
- **长期记忆**：跨会话的用户偏好学习（如 "用户喜欢暖色调"）

```python
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

agent = Agent(
    session_manager=session_manager,  # 注入 Memory
    ...
)
```

### 3. Observability（OTel 链路追踪）

Dockerfile 使用 `opentelemetry-instrument` 启动，自动追踪：
- Agent 推理过程
- 每次 Tool 调用的耗时和参数
- Bedrock 模型请求的 token 用量
- 全链路 trace 可在 CloudWatch GenAI Observability Dashboard 查看

### 4. AgentSkills（原生 Skill）

两个 `SKILL.md` 知识包，仅在 Agent 判断需要时加载到上下文：
- `scene-mode`：6 预设主题 + 8 种动态氛围配色
- `device-discovery`：设备列表 + 双语昵称映射

不使用时不占 token，比硬编码在 System Prompt 中更高效。

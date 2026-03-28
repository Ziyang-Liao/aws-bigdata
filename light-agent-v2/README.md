# Light Agent V2 — 标准化 Strands Agent 实现

基于 Strands Agents SDK (Python) 的标准 Tool + Skill 架构，实现完整的多设备智能灯光控制。

这是 `light-assistant`（TypeScript/MCP Gateway 架构）的标准化重写版本，使用 Strands SDK 原生的 `@tool` + `AgentSkills` 机制。

---

## 与 light-assistant 的对比

| 维度 | light-assistant | light-agent-v2 (本项目) |
|------|----------------|------------------------|
| 语言 | TypeScript | Python |
| Tool 定义 | JSON Schema + Lambda | `@tool` 装饰器（SDK 自动提取） |
| Skill 机制 | ❌ 未使用（仅 Tool 分组） | ✅ 原生 `AgentSkills` + `SKILL.md` |
| 部署组件 | 7+ AWS 服务 | 1 个容器 |
| 代码量 | 数千行 | ~300 行 |
| 场景能力 | 6 个硬编码主题 | 6 预设 + 8 种动态氛围（Skill 知识包） |
| 设备昵称 | 硬编码在 System Prompt | Skill 按需加载 + Tool 解析 |

---

## 架构

```
用户: "帮我切换到圣诞主题"
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Strands Agent (Claude Haiku 4.5)                │
│                                                  │
│  ┌─ Skill: scene-mode ────────────────────────┐  │
│  │ SKILL.md: 6 预设主题 + 8 动态氛围配色表     │  │  ← 按需加载
│  └────────────────────────────────────────────┘  │
│  ┌─ Skill: device-discovery ──────────────────┐  │
│  │ SKILL.md: 设备列表 + 中英文昵称映射表       │  │  ← 按需加载
│  └────────────────────────────────────────────┘  │
│           │ 指导                                 │
│           ▼                                      │
│  ┌─ Tools ────────────────────────────────────┐  │
│  │ control_light    — 控制开关/亮度/颜色       │  │  ← 始终可用
│  │ query_lights     — 查询设备状态             │  │
│  │ discover_devices — 发现可用设备             │  │
│  │ resolve_device_name — 昵称解析              │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Tool vs Skill 分工

| 类型 | 名称 | 作用 | 何时生效 |
|------|------|------|---------|
| **Tool** | `control_light` | 执行灯光控制操作 | 始终可用 |
| **Tool** | `query_lights` | 查询设备状态 | 始终可用 |
| **Tool** | `discover_devices` | 列出可用设备 | 始终可用 |
| **Tool** | `resolve_device_name` | 昵称→设备ID | 始终可用 |
| **Skill** | `scene-mode` | 主题/氛围的配色知识 | 提到"主题/场景/模式"时按需加载 |
| **Skill** | `device-discovery` | 设备列表和昵称映射知识 | 提到设备昵称或询问设备时按需加载 |

---

## 项目结构

```
light-agent-v2/
├── server.py                       # AgentCore HTTP 服务 (/ping + /invocations)
├── demo.py                         # 本地测试 Demo
├── tools.py                        # 4 个 @tool 定义
├── devices.py                      # 设备模型 + 状态管理 + 昵称映射
├── skills/
│   ├── scene-mode/
│   │   └── SKILL.md                # 场景模式知识包 (6 预设 + 8 动态氛围)
│   └── device-discovery/
│       └── SKILL.md                # 设备发现知识包 (设备列表 + 昵称表)
├── Dockerfile                      # arm64 容器镜像
├── requirements.txt
└── README.md
```

---

## 快速开始

### 本地运行

```bash
pip install -r requirements.txt

# 配置 AWS 凭证
export AWS_REGION=us-east-1

# 运行 Demo
python demo.py

# 或启动 HTTP 服务
python server.py
```

### Docker

```bash
docker build -t light-agent-v2 .
docker run -p 8080:8080 \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_REGION=us-east-1 \
  light-agent-v2

# 测试
curl http://localhost:8080/ping
echo -n "应用极光主题" | curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/octet-stream" --data-binary @-
```

### 部署到 AgentCore

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_REPO=light-agent-v2

# 创建 ECR 仓库
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

# 构建并推送
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest \
  --push .

# 创建 Runtime（复用已有的 BedrockAgentCoreRuntimeRole）
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

## 测试用例

| 类型 | 输入 | 预期行为 |
|------|------|---------|
| Tool | "打开所有灯" | `control_light(["all"], on=true)` |
| Tool | "把亮度调到60" | `control_light(["all"], brightness=60)` |
| Tool | "查看灯的状态" | `query_lights(["all"])` |
| Skill+Tool | "把电视背光调成蓝色" | Skill 解析昵称 → `resolve_device_name("电视背光")` → `control_light(["tvb"], color="#3b82f6")` |
| Skill+Tool | "应用圣诞主题" | Skill 加载配色表 → 4 次 `control_light` |
| Skill+Tool | "我想要电影之夜的氛围" | Skill 匹配 movie mood → 4 次 `control_light` |
| Tool | "我有哪些设备？" | `discover_devices()` |
| Tool | "Turn off all lights" | `control_light(["all"], on=false)` — 英文回复 |

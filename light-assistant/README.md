# Light Assistant

> 基于 AWS 全栈 Serverless + AI Agent 架构的 智能灯光控制助手，采用 Skill 化架构，支持自然语言（中/英文）对话控制智能灯光。

---

## 一、项目概述

Light Assistant 是一个智能家居灯光控制系统，用户可以通过自然语言对话（支持中英文双语）来控制 4 款智能灯具。系统集成了 AWS Bedrock AgentCore 作为 AI Agent 运行时，使用 Kimi K2.5 大模型进行意图理解，并通过 MCP (Model Context Protocol) Gateway 将 AI 决策转化为实际的设备控制操作。

项目采用 **Skill 化架构**，将 Agent 的能力拆分为 3 个独立的、可复用的 Skill 模块，每个 Skill 拥有独立的 Schema、Lambda Handler 和 MCP Gateway，Agent 通过组合 Skills 获得完整能力。

### 支持的设备

| ID | 名称 | 型号 | 类型 |
|----|------|------|------|
| hexa | Hexa Panels | H6066 | Glide 六边形灯板 |
| tvb | TV Backlight T2 | H605C | 电视氛围背光灯 |
| rope | Neon Rope 2 | H61D3 | 霓虹灯带 |
| ylight | Y Lights | H6609 | RGBIC 星芒灯 |

### 核心功能

- **自然语言控制**：通过对话控制灯光开关、亮度、颜色（如 "把所有灯调成蓝色"、"Turn on hexa at 60% brightness"）
- **设备状态查询**：实时查询所有灯具的开关、亮度、颜色、在线状态
- **主题预设**：一键应用 6 种灯光主题（圣诞、万圣节、星空、篝火、极光、日落）
- **动态场景生成**：通过自然语言描述生成灯光场景（如 "浪漫晚餐"、"movie night"）
- **设备发现与昵称解析**：自动发现在线设备，支持中英文昵称识别
- **实时状态同步**：通过 SSE (Server-Sent Events) 实时推送设备状态变更到前端
- **双语支持**：AI 自动识别用户语言并以相同语言回复

---

## 二、Skill 架构

项目将 Agent 能力拆分为 3 个独立 Skill，每个 Skill 是一个完整的功能单元：

```
┌─────────────────────────────────────────────────────────────┐
│                    Strands Agent (Kimi K2.5)                │
│                                                             │
│  System Prompt 定义 Skill 使用策略和工作流                     │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌───────────────┐  ┌───────────────┐
│ Skill 1      │  │ Skill 2       │  │ Skill 3       │
│ Device       │  │ Scene         │  │ Device        │
│ Control      │  │ Orchestration │  │ Discovery     │
├──────────────┤  ├───────────────┤  ├───────────────┤
│ MCP Gateway  │  │ MCP Gateway   │  │ MCP Gateway   │
│      ↓       │  │      ↓        │  │      ↓        │
│ Lambda       │  │ Lambda        │  │ Lambda        │
│      ↓       │  │      ↓        │  │      ↓        │
│ Express API  │  │ Express API   │  │ Express API   │
└──────────────┘  └───────────────┘  └───────────────┘
```

### Skill 1: Device Control（设备控制）

核心灯光控制能力，负责设备的开关、亮度、颜色操作和状态查询。

| Tool | 功能 | 参数 |
|------|------|------|
| `control_light` | 控制灯光开关/亮度/颜色 | device_ids, on, brightness, color |
| `query_lights` | 查询灯光当前状态 | device_ids |

```
skills/device-control/
├── manifest.json       # Skill 元数据
├── schema.json         # Tool Schema 定义
lambda/device-control/
└── index.ts            # Lambda Handler
```

### Skill 2: Scene Orchestration（场景编排）

预设主题和动态场景生成能力。新增 `create_scene` 工具，可根据自然语言描述自动生成灯光配色方案。

| Tool | 功能 | 参数 |
|------|------|------|
| `apply_theme` | 应用预设主题 | theme_id |
| `create_scene` | 根据描述动态生成场景 | description, brightness_range |

支持的动态场景 mood 映射：
- romantic（浪漫）→ 粉红/玫红色系，中低亮度
- focus（专注）→ 蓝色系，中高亮度
- relax（放松）→ 绿色系，中低亮度
- party（派对）→ 多彩混搭，高亮度
- movie（观影）→ 深蓝/靛色系，低亮度
- morning（清晨）→ 暖黄色系，中高亮度
- sleep（睡眠）→ 紫色系，极低亮度
- energetic（活力）→ 橙红黄绿，高亮度

```
skills/scene-orchestration/
├── manifest.json
├── schema.json
lambda/scene-orchestration/
└── index.ts
```

### Skill 3: Device Discovery（设备发现）

设备发现和昵称解析能力，解耦了设备列表与 Agent 配置的硬绑定。

| Tool | 功能 | 参数 |
|------|------|------|
| `discover_devices` | 发现所有可用设备及其能力 | filter (all/online/offline) |
| `resolve_device_name` | 将中英文昵称解析为设备 ID | name |

支持的昵称映射（双语）：
- hexa: "hex", "六边形", "六角", "panels"
- tvb: "tv", "电视", "背光", "电视背光"
- rope: "neon", "绳灯", "霓虹", "麋鹿"
- ylight: "y light", "y灯", "星芒", "starburst"

```
skills/device-discovery/
├── manifest.json
├── schema.json
lambda/device-discovery/
└── index.ts
```

### Skill 工作流

Agent 的 System Prompt 定义了 Skill 的使用策略：

```
1. 用户提到设备昵称 → 先调用 resolve_device_name 获取 ID
2. 直接设备操作 → 调用 control_light / query_lights
3. 预设主题 → 调用 apply_theme
4. 自定义氛围描述 → 调用 create_scene
5. 询问有哪些设备 → 调用 discover_devices
```

---

## 三、系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          用户浏览器                                  │
│                     (static/index.html)                             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
                           ▼
                ┌─────────────────────┐
                │    CloudFront CDN   │
                └───┬─────────────┬───┘
                    │             │
          静态资源 /  │             │ /api/*
                    ▼             ▼
            ┌──────────┐   ┌──────────────┐
            │  S3 桶   │   │     ALB      │
            └──────────┘   └──────┬───────┘
                                  │ :8080
                                  ▼
                        ┌──────────────────┐
                        │  Express Backend │
                        └──┬───────────┬───┘
                           │           │
              REST API     │           │  /api/chat (SSE)
                           │           ▼
                           │  ┌─────────────────────────┐
                           │  │  Bedrock AgentCore       │
                           │  │  (Strands Agent Runtime) │
                           │  └──┬────────┬────────┬────┘
                           │     │        │        │     3 MCP Gateways
                           │     ▼        ▼        ▼
                           │  ┌──────┐ ┌──────┐ ┌──────┐
                           │  │Skill1│ │Skill2│ │Skill3│
                           │  │Device│ │Scene │ │Device│
                           │  │Ctrl  │ │Orch  │ │Disc  │
                           │  └──┬───┘ └──┬───┘ └──┬───┘
                           │     │        │        │  Lambda
                           │     ▼        ▼        ▼
                           └───────► Express REST API
```

### 架构分层

| 层级 | 组件 | 技术 | 职责 |
|------|------|------|------|
| **CDN 层** | CloudFront | AWS CloudFront | HTTPS 终端、静态资源缓存、API 路由分发 |
| **前端层** | S3 + SPA | 纯 HTML/CSS/JS (单文件) | 设备控制面板 + 聊天界面 |
| **网关层** | ALB | Application Load Balancer | 负载均衡、健康检查 |
| **API 层** | Express Backend | TypeScript + Express 5 | REST API、SSE 推送、AgentCore 调用 |
| **AI 层** | AgentCore Runtime | Strands Agent SDK + Kimi K2.5 | 自然语言理解、Skill 编排 |
| **Skill 层** | 3× MCP Gateway + Lambda | AgentCore Gateway + Lambda | 按领域划分的工具能力单元 |
| **持久层** | JSON 文件 | Node.js fs | 设备状态持久化 (data/devices.json) |

---

## 四、目录结构

```
light_assistant/
├── src/                            # Express 后端源码
│   ├── server.ts                   # Express 入口
│   ├── devices.ts                  # 设备模型、主题定义、状态管理
│   ├── store.ts                    # JSON 文件持久化
│   ├── frontend.ts                 # 开发用前端服务器
│   └── routes/
│       ├── devices.ts              # 设备 CRUD + SSE 流
│       ├── themes.ts               # 主题查询与应用
│       └── chat.ts                 # AI 聊天 SSE 流
├── skills/                         # ★ Skill 定义 (Schema + Manifest)
│   ├── device-control/
│   │   ├── manifest.json           # Skill 元数据
│   │   └── schema.json             # control_light, query_lights
│   ├── scene-orchestration/
│   │   ├── manifest.json
│   │   └── schema.json             # apply_theme, create_scene
│   └── device-discovery/
│       ├── manifest.json
│       └── schema.json             # discover_devices, resolve_device_name
├── lambda/                         # ★ Skill Lambda Handlers
│   ├── device-control/
│   │   └── index.ts
│   ├── scene-orchestration/
│   │   └── index.ts
│   ├── device-discovery/
│   │   └── index.ts
│   └── light-tools/
│       └── index.ts                # (旧版单体 Lambda，保留兼容)
├── schemas/
│   └── light-tools.json            # (旧版单体 Schema，保留兼容)
├── app/
│   └── light-ts/
│       ├── main.ts                 # ★ AgentCore Runtime (Skill-based)
│       ├── Dockerfile
│       └── package.json
├── agentcore/
│   ├── agentcore.json              # ★ 3 个 Skill Gateway 声明
│   ├── aws-targets.json
│   └── cdk/
├── infra/                          # CloudFront + ALB + S3 CDK
├── static/
│   └── index.html                  # 前端 SPA
├── deploy.sh                       # ★ 一键部署 (含 3 个 Skill Lambda)
├── package.json
└── tsconfig.json
```

---

## 五、API 接口

### 设备管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/devices` | 获取所有设备列表 |
| GET | `/api/devices/:id` | 获取单个设备状态 |
| PUT | `/api/devices/:id` | 控制单个设备 (on/brightness/color) |
| PUT | `/api/devices` | 批量控制所有设备 |
| PATCH | `/api/devices/:id/online` | 设置设备在线/离线状态 |
| GET | `/api/devices/stream` | SSE 实时设备状态推送 |

### 主题

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/themes` | 获取所有主题列表 |
| POST | `/api/themes/:id/apply` | 应用指定主题 |

### AI 聊天

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息，返回 SSE 流式响应 |

---

## 六、技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript (全栈) |
| **后端框架** | Express 5 |
| **AI 模型** | Kimi K2.5 (via AWS Bedrock) |
| **Agent 框架** | Strands Agents SDK (TypeScript) |
| **Agent 运行时** | AWS Bedrock AgentCore Runtime |
| **工具协议** | MCP (Model Context Protocol) |
| **前端** | 原生 HTML/CSS/JS 单文件 SPA |
| **CDN** | AWS CloudFront |
| **负载均衡** | AWS ALB |
| **静态托管** | AWS S3 |
| **计算** | AWS EC2 + AWS Lambda × 3 |
| **IaC** | AWS CDK (TypeScript) |
| **容器化** | Docker (多阶段构建, Node 22) |
| **实时通信** | Server-Sent Events (SSE) |
| **状态持久化** | JSON 文件 (data/devices.json) |

---

## 七、架构特点

### 1. Skill 化架构（核心优化）
将原来的单一 MCP Gateway + 单一 Lambda 拆分为 3 个独立的 Skill 模块。每个 Skill 拥有：
- **独立的 Schema** — 工具定义与其他 Skill 解耦
- **独立的 Lambda** — 可独立部署、独立扩缩容、独立监控
- **独立的 MCP Gateway** — Agent 按需加载 Skill
- **Manifest 文件** — 描述 Skill 元数据，便于注册和发现

这种架构的好处：
- **可复用**：Device Control Skill 可以直接用于其他智能家居 Agent（如空调、窗帘）
- **可独立演进**：修改 Scene Orchestration 不影响 Device Control
- **可按需组合**：新 Agent 可以只加载需要的 Skill 子集
- **可独立测试**：每个 Skill Lambda 可以独立进行单元测试

### 2. AI Agent + Tool Use 模式
大模型负责理解用户意图并决定调用哪个 Skill 的哪个 Tool，MCP Gateway 负责路由，Lambda 负责执行。AI 不直接操作设备，通过结构化的工具调用链完成操作。

### 3. 流式响应 (Streaming)
全链路 SSE 流式传输：AgentCore Runtime → Express → 浏览器。聊天逐字输出 + 设备状态实时推送。

### 4. 声明式配置
`agentcore.json` 声明式定义 3 个 Skill Gateway，CDK 自动读取配置生成基础设施。

### 5. 容错与降级
Agent Runtime 内置 fallback 机制：大模型执行了工具但未生成文本时，自动从工具结果合成回复。

### 6. 一键部署
`deploy.sh` 自动部署全栈，包括 3 个 Skill Lambda 的构建和部署。

---

## 八、扩展性分析

### Skill 化带来的扩展优势

| 扩展方向 | 实现方式 | 难度 |
|----------|----------|------|
| **添加新 Skill** | 创建 `skills/xxx/` + `lambda/xxx/`，在 agentcore.json 添加 Gateway | ⭐⭐ 中 |
| **复用 Skill 到其他 Agent** | 直接引用 Skill 的 Schema + Lambda，新 Agent 添加对应 MCP Client | ⭐ 低 |
| **添加新设备** | 修改 Device Discovery Skill 的昵称映射 + Express 设备列表 | ⭐ 低 |
| **添加新主题** | 在 `devices.ts` 的 THEMES 中添加 | ⭐ 低 |
| **添加新 mood** | 在 Scene Orchestration Lambda 的 MOOD_PALETTES 中添加 | ⭐ 低 |
| **切换 AI 模型** | 修改 `MODEL_ID` 环境变量 | ⭐ 低 |
| **接入真实硬件 API** | 替换 Device Control Lambda 中的 `callAPI()` | ⭐⭐ 中 |

### 可进一步封装的 Skill

| Skill | 描述 | 复用场景 |
|-------|------|----------|
| **Schedule Skill** | 定时任务：日出自动开灯、睡前自动调暗 | 任何需要定时控制的 IoT Agent |
| **Energy Skill** | 用电统计、节能建议 | 智能家居能耗管理 |
| **Voice Skill** | 语音输入转文本 | 任何需要语音交互的 Agent |
| **Notification Skill** | 设备异常告警推送 | 任何需要告警的 IoT 系统 |

### 当前局限

- **状态持久化**：JSON 文件存储，不适合多实例（可替换为 DynamoDB）
- **单实例部署**：EC2 硬编码实例 ID（可改为 ECS/Fargate）
- **无认证**：API 无鉴权（可添加 Cognito 或 API Key）
- **会话管理**：聊天历史在进程内存中（可持久化到 DynamoDB）
- **设备模拟**：未对接真实硬件 API

---

## 九、快速开始

### 一键部署（EC2）

```bash
chmod +x deploy.sh
./deploy.sh
```

### 本地开发

```bash
npm install
npm run dev          # 后端 :8080
npm run dev:frontend # 前端 :8000
npm run dev:all      # 同时启动
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | Express 后端端口 | 8080 |
| `AGENTCORE_ARN` | AgentCore Runtime ARN | (必填) |
| `AWS_REGION` | AWS 区域 | us-east-1 |
| `AGENTCORE_GATEWAY_DEVICE_CONTROL_URL` | Device Control Skill Gateway | (AgentCore 自动注入) |
| `AGENTCORE_GATEWAY_SCENE_ORCHESTRATION_URL` | Scene Orchestration Skill Gateway | (AgentCore 自动注入) |
| `AGENTCORE_GATEWAY_DEVICE_DISCOVERY_URL` | Device Discovery Skill Gateway | (AgentCore 自动注入) |

---

## 十、部署架构图

```
AWS Cloud (us-east-1)
├── CloudFront Distribution
│   ├── Default Behavior → S3 Bucket (静态前端)
│   └── /api/* → ALB (API 后端)
├── ALB → EC2 Instance :8080 (Express Backend)
├── Skill Lambdas
│   ├── light-device-control      (Skill 1)
│   ├── light-scene-orchestration (Skill 2)
│   └── light-device-discovery    (Skill 3)
├── Bedrock AgentCore
│   ├── Runtime: light (Strands Agent, Container, Kimi K2.5)
│   └── MCP Gateways
│       ├── device-control → Lambda
│       ├── scene-orchestration → Lambda
│       └── device-discovery → Lambda
└── CDK Stacks
    ├── FrontendStack (CloudFront + ALB + S3)
    └── AgentCore-light-default (Runtime + 3 Gateways)
```

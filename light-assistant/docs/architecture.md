# Light Assistant — Architecture Design

> **AWS Bedrock AgentCore** + **Strands Agent SDK** + **Kimi K2.5** 

---

## 1. System Overview

Light Assistant is an AI-powered smart home lighting controller. Users interact via natural language (Chinese/English) to control 4 smart lights. The system uses a fully deployed AgentCore architecture with MCP tool routing.

### Core Capabilities

- Natural language control with bilingual support (auto-detect user language)
- 3 agent tools: `control_light`, `query_lights`, `apply_theme`
- SSE streaming responses (token-by-token)
- Multi-turn conversation context (3 turns, Express-side history injection)
- Real-time SVG scene visualization with theme animations
- 6 preset lighting themes
- State persistence across backend restarts

---

## 2. Architecture

### Production Architecture (Deployed)

```
     Browser
        │ HTTPS
        ▼
    CloudFront
    ┌───────────────────────────────────┐
    │  Default (*)   │  /api/*          │
    │  ───────────   │  ────────        │
    │  S3 Bucket     │  ALB (:80)       │
    │  (static/)     │    │             │
    └────────────────┼────┼─────────────┘
                     │    │
                     │    ▼
                     │  EC2 (:8080) — Express Backend
                     │  ┌──────────────────────────────────┐
                     │  │  /api/devices, /api/themes       │
                     │  │     └─ In-memory state + disk    │
                     │  │                                  │
                     │  │  /api/chat (SSE)                 │
                     │  │     │                            │
                     │  │     │ Conversation history        │
                     │  │     │ (3 turns, module-level)     │
                     │  │     │                            │
                     │  │     │ InvokeAgentRuntimeCommand   │
                     │  │     ▼                            │
                     │  │  AgentCore Runtime               │
                     │  │  (AWS managed container)          │
                     │  │     │ Strands Agent               │
                     │  │     │ + BedrockModel (Kimi K2.5)  │
                     │  │     │                            │
                     │  │     │ MCP (streamable HTTP)       │
                     │  │     ▼                            │
                     │  │  AgentCore Gateway                │
                     │  │     │                            │
                     │  │     │ Lambda Invoke               │
                     │  │     ▼                            │
                     │  │  Lambda: light-tools              │
                     │  │     │                            │
                     │  │     │ HTTP REST                   │
                     │  │     ▼                            │
                     │  │  EC2 :8080 /api/* (self-call)     │
                     │  └──────────────────────────────────┘
```

### Request Lifecycle: Chat

```
1.  Browser → POST /api/chat { message: "打开所有灯" }
2.  Express: push user turn to history[], buildPrompt() with <conversation_history>
3.  Express → InvokeAgentRuntime(ARN, payload: { prompt })
4.  AgentCore Runtime: Strands Agent.stream(prompt)
5.  Kimi K2.5 (Bedrock): decides tool call → control_light(device_ids=["all"], on=true)
6.  Agent → MCP tools/call → AgentCore Gateway → Lambda
7.  Lambda → PUT http://172.31.x.x:8080/api/devices { on: true }
8.  Express: updates DEVICES state, persistDevices(), SSE broadcast
9.  Lambda ← { success: true, results: [...] }
10. Kimi K2.5: generates text response based on tool result
11. AgentCore → Express: SSE stream of text deltas
12. Express → Browser: data: {"text":"已完成！所有灯已打开。"}
13. Express → Browser: data: {"done":true,"devices":{...}}
14. Browser: syncDevicesFromChat() → update SVG + controls + theme indicator
```

---

## 3. Frontend Design

### Single-Page Application (`static/index.html`)

One HTML file with embedded CSS and JS. Three-column layout:

| Section | Content |
|---------|---------|
| SVG Scene | Living room with 4 animated light fixtures (hexa tree, TV backlight, deer rope, starburst Y-lights) |
| Controls | Device cards (toggle, brightness slider, 8 color swatches + custom picker), 6 theme preset buttons |
| Chat | SSE streaming chat with typing cursor, suggestion chips, markdown rendering |

### State Synchronization

Two sync paths keep frontend and backend in sync:

1. **User → Backend** (REST): Toggle/slider/color changes fire `PUT /api/devices/:id`
2. **Backend → User** (SSE):
   - Chat final frame includes full device state → `syncDevicesFromChat()`
   - Real-time SSE stream at `GET /api/devices/stream` → any backend state change pushes to all connected browsers

### Theme Detection

When devices are updated via chat, `detectAndSyncTheme()` compares all device colors against known theme presets. If a match is found, the corresponding theme button is highlighted and animations are applied.

---

## 4. Backend Design (`src/`)

### Express Server (`src/server.ts`)

Minimal Express 5 setup:
- CORS enabled
- JSON body parsing
- Request logging middleware (skips health/stream endpoints)
- Three route modules mounted
- No static file serving (handled by frontend.ts in dev, S3 in prod)

### Device State (`src/devices.ts`)

In-memory `DEVICES` object shared across all routes and loaded from `data/devices.json` on startup:

```typescript
interface Device {
  id: string;
  name: string;
  model: string;
  type: string;
  online: boolean;
  state: DeviceState;    // { on, brightness, color }
}
```

State changes trigger:
1. `saveState()` — write to `data/devices.json`
2. `deviceEvents.emit('change')` — push to all SSE clients

### Chat Route (`src/routes/chat.ts`)

Key design decisions:

- **History is Express-side**: AgentCore containers are stateless (no guaranteed affinity). History is maintained as a module-level `Turn[]` array.
- **Deferred recording**: User and assistant turns are only written to history after a successful AgentCore response. This prevents failed requests from polluting context (e.g., duplicate user messages on retry).
- **Prompt injection**: History is wrapped in `<conversation_history>` XML tags and prepended to the current message.
- **Max 3 turns** (1 turn = 1 user + 1 assistant message): Old turns are shifted out to prevent context overflow.
- **Latency logging**: Detailed timing breakdown (SDK send, header, first chunk, first text, streaming, total).

---

## 5. AgentCore Runtime (`app/light-ts/`)

### Entry Point (`main.ts`)

```typescript
const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: z.object({ prompt: z.string() }),
    process: async function* (request, context) {
      const agent = await getOrCreateAgent();  // reuse across requests in same container
      for await (const event of agent.stream(prompt)) {
        // yield text deltas to caller
      }
    },
  },
});
app.run();
```

### Agent Configuration

| Setting | Value |
|---------|-------|
| Model | Kimi K2.5 (`moonshotai.kimi-k2.5`) via `BedrockModel` |
| Tools | MCP Client → AgentCore Gateway (auto-discovers 3 tools) |
| Conversation Manager | `SlidingWindowConversationManager({ windowSize: 20 })` |
| System Prompt | Bilingual, device table, intent mapping, color reference, nickname mapping |

### SDK Patches

Two bugs in `@strands-agents/sdk` v0.7 require workarounds:

**1. Falsy input check (Dockerfile `sed` patch)**

```javascript
// Bug: drops empty string "" because it's falsy in JS
if (!toolUse?.input) toolUse.input = '';
// Fix:
if (toolUse?.input == null) toolUse.input = '';
```

This caused ~13% of tool calls to fail with JSON parse errors. Confirmed root cause by comparing Node.js vs Python boto3 (Python: 15/15 pass, Node.js: 13/15 without patch).

**2. Empty text block filter (monkey-patch in main.ts)**

```typescript
// Strands SDK appends {text: ""} after toolUse blocks
// Bedrock API rejects: "The text field in the ContentBlock is blank"
// Fix: filter out empty text blocks from _formatMessages output
```

### Fallback Response Generator

When Kimi K2.5 executes tools successfully but fails to generate text (empty content block), `generateFallback()` synthesizes a response from tool results. Supports both Chinese and English based on the user's prompt language.

---

## 6. Lambda Tool Proxy (`lambda/light-tools/`)

Single Lambda function handling all 3 tools. Routes to EC2 Express REST API:

| Tool | HTTP Call |
|------|----------|
| `control_light(device_ids=["all"], on=true)` | `PUT http://EC2:8080/api/devices { on: true }` |
| `control_light(device_ids=["hexa"], color="#3b82f6")` | `PUT http://EC2:8080/api/devices/hexa { color: "#3b82f6" }` |
| `query_lights(device_ids=["all"])` | `GET http://EC2:8080/api/devices` |
| `apply_theme(theme_id="aurora")` | `POST http://EC2:8080/api/themes/aurora/apply` |

Tool name resolution: tries `event.name` → `event.toolName` → infers from input shape (Gateway doesn't always pass tool name).

---

## 7. CDK Infrastructure (`infra/`)

### Stack Resources

```
FrontendStack
├── S3 Bucket (SiteBucket)
│   ├── BlockPublicAccess: BLOCK_ALL
│   ├── RemovalPolicy: DESTROY
│   └── AutoDeleteObjects: true
│
├── BucketDeployment (DeploySite)
│   └── Source: ../../static → S3
│
├── CloudFront Distribution (CDN)
│   ├── Default: S3 via OAC
│   │   ├── ViewerProtocolPolicy: REDIRECT_TO_HTTPS
│   │   └── CachePolicy: CACHING_OPTIMIZED
│   ├── /api/*: ALB via HTTP origin
│   │   ├── AllowedMethods: ALL
│   │   ├── CachePolicy: CACHING_DISABLED
│   │   └── OriginRequestPolicy: ALL_VIEWER
│   └── DefaultRootObject: index.html
│
├── ALB (internet-facing)
│   ├── Listener: HTTP:80
│   └── Target Group: EC2 i-0874d1752e64071d4:8080
│       └── HealthCheck: /api/health (30s interval)
│
├── ALB Security Group
│   └── Ingress: 0.0.0.0/0 → TCP:80
│
└── EC2 Security Group (imported, mutable)
    └── Ingress: ALB SG → TCP:8080
```

### Deployment

```bash
cd infra
npm install
npx cdk synth          # preview CloudFormation template
npx cdk deploy         # deploy (auto-approves)
npx cdk diff           # preview changes
```

---

## 8. Devices & Themes

### Device Registry

| ID | Name | Model | Default Color | SVG Representation |
|----|------|-------|--------------|-------------------|
| `hexa` | Hexa Panels | H6066 | `#06d6a0` (teal) | 10-cell hex tree + star |
| `tvb` | TV Backlight T2 | H605C | `#8b5cf6` (purple) | 4-edge glow frame |
| `rope` | Neon Rope 2 | H61D3 | `#f59e0b` (amber) | Deer head with antlers |
| `ylight` | Y Lights | H6609 | `#ef4444` (red) | 7-panel starburst |

### Theme Presets

Each theme sets `on=true` + specific color + brightness for all 4 devices, plus an SVG animation class:

| Theme | Animation | Hexa | TV | Rope | Y Lights |
|-------|-----------|------|-----|------|----------|
| Christmas | twinkle | `#22c55e` 90% | `#ef4444` 85% | `#f59e0b` 80% | `#ef4444` 85% |
| Halloween | flicker | `#a855f7` 75% | `#f97316` 80% | `#22c55e` 70% | `#f97316` 75% |
| Starry Sky | twinkle | `#c084fc` 60% | `#1e40af` 70% | `#ffffff` 50% | `#3b82f6` 65% |
| Bonfire | flicker | `#f97316` 85% | `#ef4444` 80% | `#eab308` 75% | `#ef4444` 80% |
| Aurora | flow | `#06d6a0` 80% | `#3b82f6` 75% | `#c084fc` 70% | `#06d6a0` 75% |
| Sunset | pulse | `#ec4899` 80% | `#f97316` 85% | `#7c3aed` 70% | `#f97316` 80% |

---

## 9. SSE Streaming Protocol

### Chat SSE (`POST /api/chat`)

```
Request:  { "message": "Turn on all lights" }
Response: Content-Type: text/event-stream

data: {"text":"Done"}                    ← text chunk
data: {"text":"! All lights turned on."} ← text chunk
data: {"done":true,"refreshStatus":true,"devices":{"hexa":{"on":true,"brightness":80,"color":"#06d6a0"},...}}  ← final
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Incremental text delta |
| `done` | boolean | `true` on final event |
| `refreshStatus` | boolean | Hint to refresh device UI |
| `devices` | object | Full device state map (final event only) |
| `error` | string | Error message (if failed) |

### Device SSE (`GET /api/devices/stream`)

```
data: {"hexa":{"on":true,"brightness":80,"color":"#06d6a0"},...}
```

Pushes full device state map whenever any device changes (from REST or tool calls). Used for cross-tab sync.

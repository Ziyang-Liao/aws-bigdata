# Light Agent V2 — 标准化 Strands Agent + AgentCore 全栈部署

基于 Strands Agents SDK (Python) 的标准 Tool + Skill 架构，部署在 AWS Bedrock AgentCore 上，通过 CloudFront 对外提供 HTTPS 服务。


---

## 架构总览

```
用户浏览器 (外网)
  │ HTTPS
  ▼
CloudFront (<your-cloudfront-domain>.cloudfront.net)
  │ HTTPS
  ▼
API Gateway HTTP API (内网)
  │
  ▼
Lambda: light-agent-proxy
  │ ├── GET /        → 返回前端页面 (HTML)
  │ ├── GET /ping    → 健康检查
  │ └── POST /api/chat → 转发到 AgentCore
  │
  ▼ AWS SDK (invoke-agent-runtime)
AgentCore Runtime: light_agent_v2 (容器, arm64)
  ├── Strands Agent (Claude Haiku 4.5)
  ├── 4 个 @tool (control_light, query_lights, discover_devices, resolve_device_name)
  ├── 2 个 AgentSkills (scene-mode, device-discovery)
  ├── AgentCore Memory (跨会话持久化记忆)
  └── OTel Observability → CloudWatch
```

### 安全性

- 用户只能通过 CloudFront HTTPS 访问，无法直接触达内网服务
- AgentCore Runtime 运行在 AWS 托管环境，不暴露公网端口
- Lambda 通过 IAM Role 鉴权调用 AgentCore，无硬编码凭证
- API Gateway 作为内网网关，Lambda 做请求转发

---

## AgentCore 能力使用清单

| AgentCore 能力 | 状态 | 实现方式 |
|---|---|---|
| **Runtime** (BedrockAgentCoreApp) | ✅ | `@app.entrypoint` 标准入口 |
| **Tool** (@tool) | ✅ | 4 个装饰器函数，SDK 自动提取 schema |
| **Skill** (AgentSkills) | ✅ | 2 个 `SKILL.md` 知识包，按需加载 |
| **Memory** | ✅ | AgentCoreMemorySessionManager，SEMANTIC + USER_PREFERENCE 策略 |
| **Observability** | ✅ | `opentelemetry-instrument` 自动链路追踪 → CloudWatch |

### Memory 机制（上下文保持）

| 层级 | 机制 | 持久性 | 用途 |
|------|------|--------|------|
| 短期 | AgentCore Session（同一 session_id → 同一容器） | 容器存活期间（15分钟空闲回收） | 多轮对话连贯性 |
| 长期 | AgentCore Memory（持久化存储） | 永久（设置30天过期） | 用户偏好学习，容器回收后恢复上下文 |

---

## 项目结构

```
light-agent-v2/
├── server.py                       # BedrockAgentCoreApp 标准入口 + Memory
├── tools.py                        # 4 个 @tool 定义
├── devices.py                      # 设备模型 + 状态管理 + 昵称映射
├── demo.py                         # 本地测试 Demo
├── skills/
│   ├── scene-mode/
│   │   └── SKILL.md                # 6 预设主题 + 8 动态氛围配色
│   └── device-discovery/
│       └── SKILL.md                # 设备列表 + 双语昵称映射
├── infra/
│   └── lambda-proxy/
│       ├── index.py                # Lambda 代理 (前端 + API 转发)
│       └── frontend.html           # 完整前端 (SVG 灯光场景 + 聊天)
├── Dockerfile                      # arm64 容器 + OTel
├── requirements.txt
└── README.md
```

---

## Tool vs Skill 分工

| 类型 | 名称 | 作用 | 何时生效 |
|------|------|------|---------|
| **Tool** | `control_light` | 控制灯光开关/亮度/颜色 | 始终可用 |
| **Tool** | `query_lights` | 查询设备状态 | 始终可用 |
| **Tool** | `discover_devices` | 列出可用设备 | 始终可用 |
| **Tool** | `resolve_device_name` | 昵称→设备ID | 始终可用 |
| **Skill** | `scene-mode` | 主题/氛围的配色知识 | 提到"主题/场景/模式"时按需加载 |
| **Skill** | `device-discovery` | 设备列表和昵称映射知识 | 提到设备昵称或询问设备时按需加载 |

> **Tool 是手，Skill 是脑中的知识。** Tool 让 Agent 能"做事"，Skill 让 Agent 知道"怎么做"。Skill 内容仅在需要时加载到上下文，不用时不占 token。

---

## 部署步骤

### 前置条件

- AWS 账号，IAM 用户/角色有 AdministratorAccess（或至少 Bedrock、Lambda、ECR、API Gateway、CloudFront、IAM、CloudWatch 权限）
- EC2 实例（Amazon Linux 2 / Ubuntu），已安装 Docker + AWS CLI
- Bedrock 控制台已开启 Claude Haiku 4.5 模型访问

### Step 1: 克隆项目

```bash
git clone https://github.com/Ziyang-Liao/aws-bigdata.git
cd aws-bigdata/light-agent-v2
```

### Step 2: 创建 AgentCore Memory

```bash
aws bedrock-agentcore-control create-memory \
  --name "LightAgentMemory" \
  --description "Light agent user preferences and session context" \
  --event-expiry-duration 30 \
  --memory-strategies \
    'semanticMemoryStrategy={name=FactExtractor}' \
    'userPreferenceMemoryStrategy={name=PreferenceLearner}' \
  --region us-east-1

# 记录返回的 Memory ID，如: LightAgentMemory-xxxxxxxxxx
```

### Step 3: 给 IAM Role 添加权限

```bash
# 如果还没有 BedrockAgentCoreRuntimeRole，先创建
aws iam create-role --role-name BedrockAgentCoreRuntimeRole \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"bedrock-agentcore.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

# Bedrock 模型调用权限
aws iam put-role-policy --role-name BedrockAgentCoreRuntimeRole \
  --policy-name AgentCorePolicy \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[
      {"Effect":"Allow","Action":["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],"Resource":"*"},
      {"Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
      {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":"*"},
      {"Effect":"Allow","Action":"logs:*","Resource":"*"}
    ]
  }'

# Memory 权限
aws iam put-role-policy --role-name BedrockAgentCoreRuntimeRole \
  --policy-name AgentCoreMemoryPolicy \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Action":[
        "bedrock-agentcore:ListEvents",
        "bedrock-agentcore:CreateEvent",
        "bedrock-agentcore:ListSessions",
        "bedrock-agentcore:CreateSession",
        "bedrock-agentcore:GetSession",
        "bedrock-agentcore:ListMemoryRecords",
        "bedrock-agentcore:RetrieveMemoryRecords",
        "bedrock-agentcore:StartMemoryExtractionJob",
        "bedrock-agentcore:ListMemoryExtractionJobs"
      ],
      "Resource":"*"
    }]
  }'
```

### Step 4: 构建 Docker 镜像并推送 ECR

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=us-east-1
export ECR_REPO=light-agent-v2

# 创建 ECR 仓库
aws ecr create-repository --repository-name $ECR_REPO --region $REGION

# 登录 ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 注册 QEMU（x86 机器交叉编译 arm64 需要）
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

# 创建 buildx builder
docker buildx create --name multiarch --platform linux/amd64,linux/arm64 --use
docker buildx inspect multiarch --bootstrap

# 构建并推送 arm64 镜像
docker buildx build --platform linux/arm64 \
  --tag $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:latest \
  --push .
```

### Step 5: 创建 AgentCore Runtime

```bash
export MEMORY_ID=LightAgentMemory-xxxxxxxxxx  # 替换为 Step 2 的 ID
export ROLE_ARN=$(aws iam get-role --role-name BedrockAgentCoreRuntimeRole --query 'Role.Arn' --output text)
export IMAGE_URI=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO:latest

aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name light_agent_v2 \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"$IMAGE_URI\"}}" \
  --role-arn "$ROLE_ARN" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --environment-variables "AGENTCORE_MEMORY_ID=$MEMORY_ID,MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0,AWS_REGION=$REGION" \
  --region $REGION

# 等待 READY
watch -n 5 "aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id <RUNTIME_ID> --region $REGION --query status --output text"
```

### Step 6: 部署 Lambda 代理

```bash
export RUNTIME_ARN=arn:aws:bedrock-agentcore:$REGION:$ACCOUNT_ID:runtime/<RUNTIME_ID>

# 创建 Lambda 执行角色
aws iam create-role --role-name light-agent-proxy-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }'

aws iam attach-role-policy --role-name light-agent-proxy-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-role-policy --role-name light-agent-proxy-role \
  --policy-name AgentCoreInvoke \
  --policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Action":"bedrock-agentcore:InvokeAgentRuntime","Resource":"*"}]
  }'

sleep 10  # 等待角色传播

# 打包并创建 Lambda
cd infra/lambda-proxy
zip -j /tmp/proxy.zip index.py frontend.html

aws lambda create-function \
  --function-name light-agent-proxy \
  --runtime python3.12 \
  --handler index.handler \
  --role "arn:aws:iam::$ACCOUNT_ID:role/light-agent-proxy-role" \
  --zip-file fileb:///tmp/proxy.zip \
  --timeout 60 --memory-size 256 \
  --environment "Variables={AGENTCORE_RUNTIME_ARN=$RUNTIME_ARN}" \
  --region $REGION
```

### Step 7: 创建 API Gateway

```bash
# 创建 HTTP API
API_ID=$(aws apigatewayv2 create-api \
  --name light-agent-api \
  --protocol-type HTTP \
  --cors-configuration 'AllowOrigins=*,AllowMethods=*,AllowHeaders=content-type' \
  --region $REGION --query 'ApiId' --output text)

# Lambda 集成
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri "arn:aws:lambda:$REGION:$ACCOUNT_ID:function:light-agent-proxy" \
  --payload-format-version "2.0" \
  --region $REGION --query 'IntegrationId' --output text)

# 默认路由
aws apigatewayv2 create-route --api-id $API_ID \
  --route-key '$default' --target "integrations/$INTEGRATION_ID" --region $REGION

# 自动部署 stage
aws apigatewayv2 create-stage --api-id $API_ID \
  --stage-name '$default' --auto-deploy --region $REGION

# 给 API Gateway 调用 Lambda 的权限
aws lambda add-permission --function-name light-agent-proxy \
  --statement-id ApiGatewayInvoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*" \
  --region $REGION
```

### Step 8: 创建 CloudFront

```bash
API_DOMAIN="$API_ID.execute-api.$REGION.amazonaws.com"

aws cloudfront create-distribution \
  --distribution-config "{
    \"CallerReference\": \"light-agent-v2-$(date +%s)\",
    \"Comment\": \"Light Agent V2\",
    \"Enabled\": true,
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"api-gateway\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"AllowedMethods\": {
        \"Quantity\": 7,
        \"Items\": [\"GET\",\"HEAD\",\"OPTIONS\",\"PUT\",\"POST\",\"PATCH\",\"DELETE\"],
        \"CachedMethods\": {\"Quantity\": 2, \"Items\": [\"GET\",\"HEAD\"]}
      },
      \"CachePolicyId\": \"4135ea2d-6df8-44a3-9df3-4b5a84be39ad\",
      \"OriginRequestPolicyId\": \"b689b0a8-53d0-40ab-baf2-68738e2966ac\",
      \"Compress\": true
    },
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [{
        \"Id\": \"api-gateway\",
        \"DomainName\": \"$API_DOMAIN\",
        \"CustomOriginConfig\": {
          \"HTTPPort\": 80,
          \"HTTPSPort\": 443,
          \"OriginProtocolPolicy\": \"https-only\",
          \"OriginSslProtocols\": {\"Quantity\": 1, \"Items\": [\"TLSv1.2\"]}
        }
      }]
    }
  }" --region $REGION

# 等待部署完成（约 3-5 分钟）
```

---

## 已部署资源清单

| 资源 | 标识 |
|------|------|
| CloudFront | `https://<your-cloudfront-domain>.cloudfront.net` |
| API Gateway | `https://<your-api-id>.execute-api.us-east-1.amazonaws.com` |
| Lambda | `light-agent-proxy` |
| AgentCore Runtime | `<your-runtime-id>` |
| AgentCore Memory | `<your-memory-id>` (SEMANTIC + USER_PREFERENCE) |
| ECR | `light-agent-v2:latest` |
| IAM Roles | `BedrockAgentCoreRuntimeRole`, `light-agent-proxy-role` |

---

## 模型切换

修改 Runtime 环境变量即可，无需重新构建镜像：

```bash
# 切换到 Haiku 4.5（快，推荐）
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id <RUNTIME_ID> \
  --environment-variables "MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0,..." \
  ...

# 切换到 Opus 4.6（强，慢）
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id <RUNTIME_ID> \
  --environment-variables "MODEL_ID=us.anthropic.claude-opus-4-6-v1,..." \
  ...
```

常用模型 ID（`us.` 前缀启用跨区域推理，自动路由到最空闲节点）：

| 模型 | ID | 速度 | 能力 |
|------|-----|------|------|
| **Haiku 4.5** | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | ⚡⚡⚡ 2-3s | ★★★ |
| Sonnet 4 | `us.anthropic.claude-sonnet-4-20250514-v1:0` | ⚡⚡ 5-8s | ★★★★ |
| **Opus 4.6** | `us.anthropic.claude-opus-4-6-v1` | ⚡ 8-15s | ★★★★★ |

---

## 本地开发

```bash
pip install -r requirements.txt
export AWS_REGION=us-east-1

# 运行 Demo（不需要 AgentCore 部署）
python demo.py

# 启动本地服务
python server.py
```

---

## 常见问题

### 1. 容器启动报错 `plugin_name=<agent_skills> | plugin already registered`

**原因**: 创建了多个 `AgentSkills` 实例（如 `AgentSkills(skills="./skills/scene-mode")` 和 `AgentSkills(skills="./skills/device-discovery")`），Strands SDK 不允许同名 plugin 重复注册。

**解决**: 用单个实例加载所有 skill 目录：
```python
all_skills = AgentSkills(skills="./skills")  # 自动扫描所有子目录
```

### 2. Memory 报错 `AccessDeniedException: not authorized to perform bedrock-agentcore:ListEvents`

**原因**: AgentCore Runtime 的 IAM Role 缺少 Memory 相关权限。

**解决**: 给 `BedrockAgentCoreRuntimeRole` 添加 Memory 权限（见 Step 3）。添加后需要更新 Runtime 触发容器重启才能生效。

### 3. Lambda Function URL 返回 `Forbidden`

**原因**: 账号级别的 S3/Lambda Block Public Access 策略阻止了 `AUTH_TYPE=NONE` 的 Function URL。

**解决**: 改用 API Gateway HTTP API 作为 Lambda 前端，不依赖 Function URL。

### 4. 页面加载后说"你好"，所有灯被关闭

**原因**: 前端初始化时在本地 `applyTheme('aurora')` 把灯打开了，但后端设备初始状态是全关。用户发消息后，后端返回全关状态，前端检测到差异就把灯关了。

**解决**: 后端 `devices.py` 的 `DEFAULT_STATES` 设为 aurora 主题（全部 on + aurora 配色），与前端初始状态一致。

### 5. 没有多轮对话上下文

**原因**: 每次请求生成新的 `runtimeSessionId`，AgentCore 认为是不同会话。

**解决**: 前端生成固定的 `chatSessionId`（页面生命周期内不变），每次请求都带上。Lambda 从请求中取出 `session_id` 传给 AgentCore。

### 6. 容器回收后上下文丢失

**原因**: 容器空闲 15 分钟被 AgentCore 回收，内存中的对话历史丢失。

**解决**: 启用 AgentCore Memory。`AgentCoreMemorySessionManager` 会自动将对话持久化，新容器启动时从 Memory 恢复历史。

### 7. Docker buildx 不支持 arm64

**原因**: AgentCore Runtime 要求 arm64 镜像，x86 机器默认不支持交叉编译。

**解决**:
```bash
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes
docker buildx create --name multiarch --platform linux/amd64,linux/arm64 --use
docker buildx inspect multiarch --bootstrap  # 确认 Platforms 包含 linux/arm64
```

### 8. `runtimeSessionId` 长度不足

**原因**: AgentCore 要求 `runtimeSessionId` 至少 33 个字符。

**解决**: 生成足够长的 session ID，如 `session-{random}-{timestamp}`。

### 9. CloudFront 更新后仍返回旧内容

**原因**: CloudFront 边缘节点缓存了旧响应。

**解决**:
```bash
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
```
等待 15-30 秒后刷新。

### 10. 操作单个灯时其他灯状态被重置

**原因**: 后端每次返回全量 `deviceState`，前端无差别全量覆盖。

**解决**: 前端采用差异对比同步——逐个设备比较前后端状态，只有真正变化的设备才更新 UI。

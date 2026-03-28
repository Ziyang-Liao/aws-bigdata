"""
Light Agent V2 — AgentCore Runtime 标准入口

使用 AgentCore 全部核心能力：
  - BedrockAgentCoreApp（标准化运行时入口）
  - AgentSkills（原生 Skill 机制）
  - AgentCore Memory（跨会话记忆）
  - Observability（OTel 自动链路追踪）
"""

import os
from strands import Agent, AgentSkills
from strands.models.bedrock import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from tools import control_light, query_lights, discover_devices, resolve_device_name
from devices import device_states

# ── Configuration ──────────────────────────────────────────────

MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")
MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID", "")

SYSTEM_PROMPT = (
    "你是智能灯光控制助手，帮助用户通过自然语言控制 4 台智能灯具。\n"
    "规则：\n"
    "1. 始终用用户的语言回复（中文问中文答，英文问英文答）\n"
    "2. 如果用户提到场景/主题/模式/氛围，先激活 scene-mode 技能获取配置，再执行操作\n"
    "3. 如果用户用昵称指代设备，先激活 device-discovery 技能解析设备 ID\n"
    "4. 没有指定具体设备时，默认操作所有设备\n"
    "5. 操作后简洁告知结果，设备离线时如实告知\n"
    "6. 只处理灯光相关请求，其他请求礼貌拒绝\n"
    "7. 利用记忆了解用户偏好，如用户之前喜欢暖色调，推荐时优先暖色"
)

# ── Skills ─────────────────────────────────────────────────────

scene_skill = AgentSkills(skills="./skills/scene-mode")
discovery_skill = AgentSkills(skills="./skills/device-discovery")

# ── Model ──────────────────────────────────────────────────────

model = BedrockModel(model_id=MODEL_ID, region_name=REGION)

# ── Memory (AgentCore Memory — 跨会话记忆) ─────────────────────

session_manager = None

if MEMORY_ID:
    try:
        from bedrock_agentcore.memory.integrations.strands.config import (
            AgentCoreMemoryConfig,
        )
        from bedrock_agentcore.memory.integrations.strands.session_manager import (
            AgentCoreMemorySessionManager,
        )

        agentcore_memory_config = AgentCoreMemoryConfig(
            memory_id=MEMORY_ID,
            session_id="light-agent-default",
            actor_id="light-agent-user",
        )
        session_manager = AgentCoreMemorySessionManager(
            agentcore_memory_config=agentcore_memory_config,
            region_name=REGION,
        )
        print(f"[Memory] AgentCore Memory enabled: {MEMORY_ID}")
    except Exception as e:
        print(f"[Memory] Failed to init AgentCore Memory: {e}, falling back to in-memory")

# ── Agent ──────────────────────────────────────────────────────

agent_kwargs = dict(
    model=model,
    tools=[control_light, query_lights, discover_devices, resolve_device_name],
    plugins=[scene_skill, discovery_skill],
    system_prompt=SYSTEM_PROMPT,
)

if session_manager:
    agent_kwargs["session_manager"] = session_manager

agent = Agent(**agent_kwargs)

# ── BedrockAgentCoreApp（标准化运行时入口）─────────────────────

app = BedrockAgentCoreApp()


@app.entrypoint
def handle(payload: dict):
    """AgentCore Runtime 标准入口"""
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "missing prompt"}

    result = agent(prompt)
    return {
        "response": str(result),
        "deviceState": {**device_states},
    }


if __name__ == "__main__":
    app.run()

"""
Light Agent V2 — AgentCore Runtime 标准入口

AgentCore 能力：
  - BedrockAgentCoreApp（标准化运行时入口）
  - AgentSkills（原生 Skill 机制）
  - AgentCore Memory（跨会话持久化记忆）
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
    "7. 利用记忆了解用户偏好，如用户之前喜欢暖色调，推荐时优先暖色\n"
    "8. 在没有确定用户真实意图之前，不要执行任何操作，先询问确认"
)

# ── Skills（单个实例加载所有 skill 目录）─────────────────────

all_skills = AgentSkills(skills="./skills")

# ── Model ──────────────────────────────────────────────────────

model = BedrockModel(model_id=MODEL_ID, region_name=REGION)

# ── Memory（AgentCore Memory — 跨会话持久化）───────────────────

def create_session_manager(session_id: str, actor_id: str):
    """为每个请求创建 session manager，支持跨会话持久化记忆。"""
    if not MEMORY_ID:
        return None
    try:
        from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
        from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

        config = AgentCoreMemoryConfig(
            memory_id=MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
        )
        return AgentCoreMemorySessionManager(
            agentcore_memory_config=config,
            region_name=REGION,
        )
    except Exception as e:
        print(f"[Memory] Init failed: {e}")
        return None


# ── Agent 工厂（每个 session 创建带 Memory 的 Agent）──────────

def create_agent(session_id: str = "default", actor_id: str = "user"):
    sm = create_session_manager(session_id, actor_id)
    kwargs = dict(
        model=model,
        tools=[control_light, query_lights, discover_devices, resolve_device_name],
        plugins=[all_skills],
        system_prompt=SYSTEM_PROMPT,
    )
    if sm:
        kwargs["session_manager"] = sm
        print(f"[Agent] Created with Memory (session={session_id}, actor={actor_id})")
    else:
        print(f"[Agent] Created without Memory (session={session_id})")
    return sm, Agent(**kwargs)


# ── BedrockAgentCoreApp ───────────────────────────────────────

app = BedrockAgentCoreApp()


@app.entrypoint
def handle(payload: dict):
    prompt = payload.get("prompt", "")
    if not prompt:
        return {"error": "missing prompt"}

    session_id = payload.get("session_id", "default-session-xxxxxxxxxxxxxxxx")
    actor_id = payload.get("actor_id", "web-user")

    sm, agent = create_agent(session_id, actor_id)
    try:
        result = agent(prompt)
        return {
            "response": str(result),
            "deviceState": {**device_states},
        }
    finally:
        # 确保 Memory buffer 被 flush
        if sm:
            try:
                sm.close()
            except Exception:
                pass


if __name__ == "__main__":
    app.run()

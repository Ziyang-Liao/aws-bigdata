"""
Light Agent V2 — 本地 Demo

展示 Tool + Skill 协作：
  - Tool 直接调用：开关、亮度、颜色、查询
  - Skill 场景模式：预设主题 + 动态氛围
  - Skill 设备发现：昵称解析
"""

import json
from strands import Agent, AgentSkills
from strands.models.bedrock import BedrockModel
from tools import control_light, query_lights, discover_devices, resolve_device_name
from devices import device_states

# ── Skills ──
scene_skill = AgentSkills(skills="./skills/scene-mode")
discovery_skill = AgentSkills(skills="./skills/device-discovery")

# ── Agent ──
model = BedrockModel(
    model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
    region_name="us-east-1",
)

agent = Agent(
    model=model,
    tools=[control_light, query_lights, discover_devices, resolve_device_name],
    plugins=[scene_skill, discovery_skill],
    system_prompt=(
        "你是智能灯光控制助手，帮助用户通过自然语言控制 4 台智能灯具。\n"
        "规则：\n"
        "1. 始终用用户的语言回复（中文问中文答，英文问英文答）\n"
        "2. 如果用户提到场景/主题/模式/氛围，先激活 scene-mode 技能获取配置，再执行操作\n"
        "3. 如果用户用昵称指代设备，先激活 device-discovery 技能解析设备 ID\n"
        "4. 没有指定具体设备时，默认操作所有设备\n"
        "5. 操作后简洁告知结果，设备离线时如实告知\n"
        "6. 只处理灯光相关请求，其他请求礼貌拒绝"
    ),
)

# ── 测试用例 ──
test_cases = [
    ("Tool 直接调用", "打开所有灯"),
    ("Tool 直接调用", "把亮度调到60"),
    ("Tool 直接调用", "查看所有灯的状态"),
    ("Skill 昵称解析", "把电视背光调成蓝色"),
    ("Skill 场景模式", "应用圣诞主题"),
    ("Skill 动态氛围", "我想要电影之夜的氛围"),
    ("Tool 直接调用", "Turn off all lights"),
    ("Skill 设备发现", "我有哪些设备？"),
]

print("💡 Light Agent V2 — Tool + Skill Demo")
print("=" * 55)

for label, user_input in test_cases:
    print(f"\n[{label}] 📝 用户: {user_input}")
    print("-" * 55)
    result = agent(user_input)
    print(f"💡 设备状态: {json.dumps(device_states, ensure_ascii=False)[:200]}")
    print("=" * 55)

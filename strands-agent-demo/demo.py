from strands.models.bedrock import BedrockModel
"""
本地 Demo — 同时展示 Tool 和 Skill 的使用方式

Tool:  直接执行具体操作（开灯、调亮度、调颜色）
Skill: 按需加载领域知识（场景模式指令），指导 Agent 组合调用多个 Tool
"""

from strands import Agent, AgentSkills
from tools import toggle_light, set_brightness, set_color, device_state

# ── 创建 Skill 插件 ──────────────────────────────
skill_plugin = AgentSkills(skills="./skills/scene-mode")

# ── 创建 Agent（同时注册 Tool + Skill）────────────
model = BedrockModel(model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0", region_name="us-east-1")

agent = Agent(
    model=model,
    tools=[toggle_light, set_brightness, set_color],
    plugins=[skill_plugin],
    system_prompt=(
        "你是一个智能灯效控制助手。用户会用自然语言描述灯光需求，"
        "你需要调用合适的工具来控制灯光。每次操作后用中文简洁地告诉用户结果。"
        "如果用户提到场景或模式，先激活 scene-mode 技能获取场景参数，再执行操作。"
    ),
)

# ── 测试用例 ──────────────────────────────────────
# 前 3 个测试 Tool 直接调用，后 2 个测试 Skill 激活后组合调用
test_cases = [
    ("Tool 直接调用", "帮我把客厅的灯打开"),
    ("Tool 直接调用", "把亮度调到80"),
    ("Tool 直接调用", "换成暖白色的灯光"),
    ("Skill 场景模式", "帮我切换到电影模式"),
    ("Skill 场景模式", "我要开派对模式"),
]

print("🔦 灯效控制 Agent Demo — Tool + Skill 对比")
print("=" * 50)

for label, user_input in test_cases:
    print(f"\n[{label}] 📝 用户: {user_input}")
    print("-" * 50)
    result = agent(user_input)
    print(f"💡 设备状态: {device_state}")
    print("=" * 50)

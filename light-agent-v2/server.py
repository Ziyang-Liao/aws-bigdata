"""
Light Agent V2 — AgentCore Runtime HTTP 服务

标准 AgentCore 服务契约：
  POST /invocations — Agent 调用入口
  GET  /ping        — 健康检查
"""

import json
from flask import Flask, request, jsonify
from strands import Agent, AgentSkills
from strands.models.bedrock import BedrockModel
from tools import control_light, query_lights, discover_devices, resolve_device_name
from devices import device_states

app = Flask(__name__)

# ── Skills ──
scene_skill = AgentSkills(skills="./skills/scene-mode")
discovery_skill = AgentSkills(skills="./skills/device-discovery")

# ── Model ──
model = BedrockModel(
    model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0",
    region_name="us-east-1",
)

# ── Agent ──
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


@app.route("/ping", methods=["GET"])
def ping():
    return "ok"


@app.route("/invocations", methods=["POST"])
def invocations():
    try:
        prompt = request.get_data(as_text=True)
        result = agent(prompt)
        return jsonify({"response": str(result), "deviceState": {**device_states}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)

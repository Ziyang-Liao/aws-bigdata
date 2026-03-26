from strands.models.bedrock import BedrockModel
"""
AgentCore Runtime HTTP 服务
POST /invocations — Agent 调用入口
GET  /ping        — 健康检查
"""

import json
from flask import Flask, request, jsonify
from strands import Agent, AgentSkills
from tools import toggle_light, set_brightness, set_color, device_state

app = Flask(__name__)

skill_plugin = AgentSkills(skills="./skills/scene-mode")

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


@app.route("/ping", methods=["GET"])
def ping():
    return "ok"


@app.route("/invocations", methods=["POST"])
def invocations():
    try:
        prompt = request.get_data(as_text=True)
        result = agent(prompt)
        return jsonify({
            "response": str(result),
            "deviceState": {**device_state},
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)

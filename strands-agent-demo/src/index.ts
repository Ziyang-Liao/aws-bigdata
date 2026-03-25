/**
 * AgentCore Runtime HTTP 服务
 * POST /invocations — Agent 调用入口
 * GET  /ping        — 健康检查
 */
import { Agent } from "@strands-agents/sdk";
import express from "express";
import { toggleLight, setBrightness, setColor, deviceState } from "./tools.js";

const PORT = process.env.PORT || 8080;

const agent = new Agent({
  tools: [toggleLight, setBrightness, setColor],
  systemPrompt:
    "你是一个智能灯效控制助手。用户会用自然语言描述灯光需求，你需要调用合适的工具来控制灯光。每次操作后用中文简洁地告诉用户结果。",
  printer: false,
});

const app = express();

app.get("/ping", (_req, res) => res.send("ok"));

app.post("/invocations", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const prompt = new TextDecoder().decode(req.body);
    const result = await agent.invoke(prompt);
    return res.json({
      response: result.lastMessage,
      deviceState: { ...deviceState },
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🔦 Light Control Agent listening on port ${PORT}`);
});

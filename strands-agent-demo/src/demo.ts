/**
 * 灯效控制 Agent Demo
 *
 * 3 个 Skill（Tool）：
 *   1. toggle_light  — 开灯 / 关灯
 *   2. set_brightness — 亮度调整 (0-100)
 *   3. set_color      — 颜色调整
 *
 * 每个 tool 返回模拟的 MCP 响应，不依赖真实硬件。
 */

import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";

// ── 模拟设备状态 ──────────────────────────────────
const deviceState = {
  power: false,
  brightness: 50,
  color: "#FFFFFF",
};

// ── Tool 1: 开灯 / 关灯 ──────────────────────────
const toggleLight = tool({
  name: "toggle_light",
  description:
    "Turn a light on or off. Use action 'on' to turn on, 'off' to turn off.",
  inputSchema: z.object({
    action: z.enum(["on", "off"]).describe("on = turn on, off = turn off"),
  }),
  callback: (input) => {
    deviceState.power = input.action === "on";
    // 模拟 MCP 响应
    return JSON.stringify({
      mcp_device: "living_room_light",
      mcp_action: input.action,
      mcp_status: "success",
      mcp_timestamp: new Date().toISOString(),
      state: { ...deviceState },
    });
  },
});

// ── Tool 2: 亮度调整 ─────────────────────────────
const setBrightness = tool({
  name: "set_brightness",
  description:
    "Adjust light brightness. Value range: 0 (dimmest) to 100 (brightest).",
  inputSchema: z.object({
    brightness: z
      .number()
      .min(0)
      .max(100)
      .describe("Brightness level 0-100"),
  }),
  callback: (input) => {
    deviceState.brightness = input.brightness;
    if (!deviceState.power) deviceState.power = true; // 调亮度时自动开灯
    return JSON.stringify({
      mcp_device: "living_room_light",
      mcp_action: "set_brightness",
      mcp_status: "success",
      mcp_timestamp: new Date().toISOString(),
      state: { ...deviceState },
    });
  },
});

// ── Tool 3: 颜色调整 ─────────────────────────────
const setColor = tool({
  name: "set_color",
  description:
    "Change light color. Accepts common color names (red, blue, green, warm_white, cool_white, purple, orange, pink) or hex codes like #FF0000.",
  inputSchema: z.object({
    color: z.string().describe("Color name or hex code, e.g. red, #00FF00"),
  }),
  callback: (input) => {
    const colorMap: Record<string, string> = {
      red: "#FF0000",
      green: "#00FF00",
      blue: "#0000FF",
      warm_white: "#FFD700",
      cool_white: "#F0F8FF",
      purple: "#800080",
      orange: "#FFA500",
      pink: "#FFC0CB",
      white: "#FFFFFF",
      yellow: "#FFFF00",
    };
    const hex =
      colorMap[input.color.toLowerCase()] ||
      (input.color.startsWith("#") ? input.color : "#FFFFFF");
    deviceState.color = hex;
    if (!deviceState.power) deviceState.power = true;
    return JSON.stringify({
      mcp_device: "living_room_light",
      mcp_action: "set_color",
      mcp_status: "success",
      mcp_timestamp: new Date().toISOString(),
      state: { ...deviceState },
    });
  },
});

// ── Agent ─────────────────────────────────────────
const agent = new Agent({
  tools: [toggleLight, setBrightness, setColor],
  systemPrompt:
    "你是一个智能灯效控制助手。用户会用自然语言描述灯光需求，你需要调用合适的工具来控制灯光。每次操作后用中文简洁地告诉用户结果。",
});

// ── Demo 测试 ─────────────────────────────────────
const testCases = [
  "帮我把客厅的灯打开",
  "把亮度调到80",
  "换成暖白色的灯光",
  "关灯",
];

console.log("🔦 灯效控制 Agent Demo\n" + "=".repeat(40));

for (const input of testCases) {
  console.log(`\n📝 用户: ${input}`);
  console.log("-".repeat(40));
  const result = await agent.invoke(input);
  // 提取文本内容
  const msg = result.lastMessage;
  const text =
    typeof msg === "string"
      ? msg
      : Array.isArray(msg?.content)
        ? msg.content
            .filter((b: any) => b.type === "textBlock" || b.text)
            .map((b: any) => b.text)
            .join("")
        : JSON.stringify(msg);
  console.log(`\n🤖 助手: ${text}`);
  console.log(`💡 设备状态: ${JSON.stringify(deviceState)}`);
  console.log("=".repeat(40));
}

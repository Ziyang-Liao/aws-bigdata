/**
 * 灯效控制 Tools 定义
 * 3 个 Skill: toggle_light / set_brightness / set_color
 */
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

// 模拟设备状态
export const deviceState = { power: false, brightness: 50, color: "#FFFFFF" };

const mcpResponse = (action: string) =>
  JSON.stringify({
    mcp_device: "living_room_light",
    mcp_action: action,
    mcp_status: "success",
    mcp_timestamp: new Date().toISOString(),
    state: { ...deviceState },
  });

export const toggleLight = tool({
  name: "toggle_light",
  description: "Turn a light on or off. action: 'on' or 'off'.",
  inputSchema: z.object({
    action: z.enum(["on", "off"]),
  }),
  callback: (input) => {
    deviceState.power = input.action === "on";
    return mcpResponse(input.action);
  },
});

export const setBrightness = tool({
  name: "set_brightness",
  description: "Adjust light brightness. Value: 0 (dimmest) to 100 (brightest).",
  inputSchema: z.object({
    brightness: z.number().min(0).max(100),
  }),
  callback: (input) => {
    deviceState.brightness = input.brightness;
    if (!deviceState.power) deviceState.power = true;
    return mcpResponse("set_brightness");
  },
});

export const setColor = tool({
  name: "set_color",
  description:
    "Change light color. Accepts color names (red, blue, warm_white, cool_white, purple, etc.) or hex codes like #FF0000.",
  inputSchema: z.object({
    color: z.string().describe("Color name or hex code"),
  }),
  callback: (input) => {
    const map: Record<string, string> = {
      red: "#FF0000", green: "#00FF00", blue: "#0000FF",
      warm_white: "#FFD700", cool_white: "#F0F8FF",
      purple: "#800080", orange: "#FFA500", pink: "#FFC0CB",
      white: "#FFFFFF", yellow: "#FFFF00",
    };
    deviceState.color =
      map[input.color.toLowerCase()] ||
      (input.color.startsWith("#") ? input.color : "#FFFFFF");
    if (!deviceState.power) deviceState.power = true;
    return mcpResponse("set_color");
  },
});

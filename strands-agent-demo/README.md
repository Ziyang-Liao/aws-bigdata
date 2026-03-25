# 灯效控制 Agent Demo

基于 Strands Agents SDK (TypeScript) 的智能灯效控制 Demo。

## 架构

```
用户自然语言输入
       │
       ▼
┌─────────────────────┐
│  Strands Agent       │  ← Bedrock Claude 推理
│  (Agent Loop)        │
└─────────────────────┘
       │ 选择 Tool
       ▼
┌─────────────────────┐
│  toggle_light       │  开灯 / 关灯
│  set_brightness     │  亮度调整 (0-100)
│  set_color          │  颜色调整 (名称/HEX)
└─────────────────────┘
       │
       ▼ 模拟 MCP 响应
  返回设备状态 JSON
```

## 快速开始

```bash
npm install
npm run demo
```

## 测试用例

| 输入 | 预期调用的 Tool |
|------|----------------|
| 帮我把客厅的灯打开 | `toggle_light(on)` |
| 把亮度调到80 | `set_brightness(80)` |
| 换成暖白色的灯光 | `set_color(warm_white)` |
| 关灯 | `toggle_light(off)` |

## 前置条件

- Node.js 20+
- AWS 凭证（需要 Bedrock Claude 模型访问权限）

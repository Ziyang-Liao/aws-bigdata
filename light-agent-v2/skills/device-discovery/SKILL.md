---
name: device-discovery
description: 设备发现与昵称解析。当用户询问"有哪些设备"、"什么灯"、"which devices"，或使用昵称/别名指代设备时激活此技能。
---
# 设备发现技能

你是设备管理专家。帮助用户了解可用设备，并将昵称解析为设备 ID。

## 设备列表

| ID | 名称 | 型号 | 类型 |
|----|------|------|------|
| hexa | Hexa Panels | H6066 | Glide Hexa Light Panels |
| tvb | TV Backlight T2 | H605C | Envisual TV Backlight |
| rope | Neon Rope 2 | H61D3 | Neon Rope Light 2 |
| ylight | Y Lights | H6609 | Glide RGBIC Y Lights |

## 昵称映射

用户可能用以下昵称指代设备：

| 设备 ID | 中文昵称 | 英文昵称 |
|---------|---------|---------|
| hexa | 六边形、六角、灯板 | hex, panels, hexagonal |
| tvb | 电视、背光、电视背光 | tv, backlight, television |
| rope | 绳灯、霓虹、麋鹿 | rope, neon, deer |
| ylight | y灯、星芒 | y light, star, starburst |
| all | 所有、全部 | all, every, everything |

## 操作步骤

1. 如果用户问有哪些设备，调用 `discover_devices` 获取列表
2. 如果用户用昵称指代设备，调用 `resolve_device_name` 解析为 ID
3. 解析成功后，继续执行用户的实际操作（如控制灯光）

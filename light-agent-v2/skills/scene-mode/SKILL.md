---
name: scene-mode
description: 预设灯光场景和动态氛围模式。当用户提到"主题"、"场景"、"模式"、"氛围"、"theme"、"scene"、"mode"时激活此技能。
---
# 场景模式技能

你是灯光场景专家。根据用户请求的场景，调用 `control_light` 工具组合设置所有 4 台灯具。

## 预设主题

对每个主题，使用 `control_light(device_ids=["hexa","tvb","rope","ylight"], ...)` 分别设置每台灯。

### Christmas（圣诞）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #22c55e | 90 |
| tvb | #ef4444 | 85 |
| rope | #f59e0b | 80 |
| ylight | #ef4444 | 85 |

### Halloween（万圣节）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #a855f7 | 75 |
| tvb | #f97316 | 80 |
| rope | #22c55e | 70 |
| ylight | #f97316 | 75 |

### Starry（星空）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #c084fc | 60 |
| tvb | #1e40af | 70 |
| rope | #ffffff | 50 |
| ylight | #3b82f6 | 65 |

### Bonfire（篝火）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #f97316 | 85 |
| tvb | #ef4444 | 80 |
| rope | #eab308 | 75 |
| ylight | #ef4444 | 80 |

### Aurora（极光）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #06d6a0 | 80 |
| tvb | #3b82f6 | 75 |
| rope | #c084fc | 70 |
| ylight | #06d6a0 | 75 |

### Sunset（日落）
| 设备 | 颜色 | 亮度 |
|------|------|------|
| hexa | #ec4899 | 80 |
| tvb | #f97316 | 85 |
| rope | #7c3aed | 70 |
| ylight | #f97316 | 80 |

## 动态氛围模式

如果用户描述的不是上面的预设主题，而是一种氛围（如"浪漫晚餐"、"movie night"），根据以下映射选择配色：

| 氛围关键词 | 配色方案 | 亮度范围 |
|-----------|---------|---------|
| 浪漫/romantic/dinner/date | #ec4899 #f43f5e #e11d48 #be185d | 50-70 |
| 专注/focus/work/study | #3b82f6 #1e40af #1d4ed8 #2563eb | 60-80 |
| 放松/relax/calm/chill | #06d6a0 #10b981 #059669 #047857 | 40-65 |
| 派对/party/dance/celebrate | #ef4444 #8b5cf6 #06d6a0 #f59e0b | 80-100 |
| 电影/movie/cinema/film | #1e1b4b #312e81 #3730a3 #4338ca | 20-40 |
| 早晨/morning/sunrise/wake | #fef3c7 #fde68a #fcd34d #fbbf24 | 60-85 |
| 睡眠/sleep/night/bedtime | #7c3aed #6d28d9 #5b21b6 #4c1d95 | 10-30 |
| 活力/energy/sport/exercise | #f97316 #ef4444 #eab308 #22c55e | 75-95 |

4 个颜色分别对应 hexa、tvb、rope、ylight。

## 操作步骤

1. 识别用户要求的主题或氛围
2. 对每台设备分别调用 `control_light`，设置 on=true + 对应颜色和亮度
3. 用用户的语言简洁描述已应用的效果

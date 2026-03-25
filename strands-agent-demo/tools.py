"""
灯效控制 Tools 定义
3 个 Tool: toggle_light / set_brightness / set_color
"""

import json
from datetime import datetime, timezone
from strands import tool

# 模拟设备状态
device_state = {"power": False, "brightness": 50, "color": "#FFFFFF"}

COLOR_MAP = {
    "red": "#FF0000", "green": "#00FF00", "blue": "#0000FF",
    "warm_white": "#FFD700", "cool_white": "#F0F8FF",
    "purple": "#800080", "orange": "#FFA500", "pink": "#FFC0CB",
    "white": "#FFFFFF", "yellow": "#FFFF00",
}


def _mcp_response(action: str) -> str:
    return json.dumps({
        "mcp_device": "living_room_light",
        "mcp_action": action,
        "mcp_status": "success",
        "mcp_timestamp": datetime.now(timezone.utc).isoformat(),
        "state": {**device_state},
    })


@tool
def toggle_light(action: str) -> str:
    """Turn a light on or off.

    Args:
        action: 'on' to turn on, 'off' to turn off.
    """
    device_state["power"] = action == "on"
    return _mcp_response(action)


@tool
def set_brightness(brightness: int) -> str:
    """Adjust light brightness.

    Args:
        brightness: Brightness level 0 (dimmest) to 100 (brightest).
    """
    device_state["brightness"] = max(0, min(100, brightness))
    if not device_state["power"]:
        device_state["power"] = True
    return _mcp_response("set_brightness")


@tool
def set_color(color: str) -> str:
    """Change light color. Accepts color names (red, blue, warm_white, cool_white, purple, pink, etc.) or hex codes like #FF0000.

    Args:
        color: Color name or hex code.
    """
    device_state["color"] = COLOR_MAP.get(
        color.lower(), color if color.startswith("#") else "#FFFFFF"
    )
    if not device_state["power"]:
        device_state["power"] = True
    return _mcp_response("set_color")

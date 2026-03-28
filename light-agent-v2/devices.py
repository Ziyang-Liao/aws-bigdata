"""
Light Agent V2 — 设备模型与状态管理

4 台智能灯具的模拟状态，支持持久化到 JSON 文件。
"""

import json
import os
from pathlib import Path
from threading import Lock

DATA_FILE = Path(__file__).parent / "data" / "devices.json"

_lock = Lock()

DEVICE_REGISTRY = {
    "hexa": {"name": "Hexa Panels", "model": "H6066", "type": "Glide Hexa Light Panels"},
    "tvb": {"name": "TV Backlight T2", "model": "H605C", "type": "Envisual TV Backlight"},
    "rope": {"name": "Neon Rope 2", "model": "H61D3", "type": "Neon Rope Light 2"},
    "ylight": {"name": "Y Lights", "model": "H6609", "type": "Glide RGBIC Y Lights"},
}

DEFAULT_STATES = {
    "hexa":   {"on": True, "brightness": 80, "color": "#06d6a0", "online": True},
    "tvb":    {"on": True, "brightness": 75, "color": "#3b82f6", "online": True},
    "rope":   {"on": True, "brightness": 70, "color": "#c084fc", "online": True},
    "ylight": {"on": True, "brightness": 75, "color": "#06d6a0", "online": True},
}

# Bilingual nickname → device_id
NICKNAMES = {
    "hexa": "hexa", "hex": "hexa", "六边形": "hexa", "六角": "hexa", "panels": "hexa",
    "tvb": "tvb", "tv": "tvb", "电视": "tvb", "背光": "tvb", "电视背光": "tvb", "backlight": "tvb",
    "rope": "rope", "neon": "rope", "绳灯": "rope", "霓虹": "rope", "麋鹿": "rope",
    "ylight": "ylight", "y light": "ylight", "y灯": "ylight", "星芒": "ylight", "star": "ylight",
    "all": "all", "所有": "all", "全部": "all", "every": "all",
}


def _load() -> dict:
    try:
        if DATA_FILE.exists():
            return json.loads(DATA_FILE.read_text())
    except Exception:
        pass
    return {did: {**s} for did, s in DEFAULT_STATES.items()}


def _save(states: dict):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(states, indent=2))


# In-memory state, loaded once
device_states: dict = _load()


def get_device_ids(ids: list[str]) -> list[str]:
    """Resolve device IDs, expanding 'all'."""
    if "all" in ids:
        return list(DEVICE_REGISTRY.keys())
    return [i for i in ids if i in DEVICE_REGISTRY]


def get_state(device_id: str) -> dict:
    return {
        "id": device_id,
        **DEVICE_REGISTRY.get(device_id, {}),
        **device_states.get(device_id, {}),
    }


def update_state(device_id: str, *, on=None, brightness=None, color=None) -> dict:
    s = device_states.setdefault(device_id, {**DEFAULT_STATES.get(device_id, {})})
    if not s.get("online", True):
        return {"id": device_id, "error": "device_offline"}
    if on is not None:
        s["on"] = bool(on)
    if brightness is not None:
        s["brightness"] = max(0, min(100, int(brightness)))
    if color is not None:
        s["color"] = color
    _save(device_states)
    return get_state(device_id)


def resolve_nickname(name: str) -> str | None:
    """Resolve a nickname to device_id. Returns None if no match."""
    low = name.lower().strip()
    if low in NICKNAMES:
        return NICKNAMES[low]
    for nick, did in NICKNAMES.items():
        if nick in low or low in nick:
            return did
    return None

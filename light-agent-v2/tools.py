"""
Light Agent V2 — Tool 定义

4 个 Tool，使用 @tool 装饰器，Strands SDK 自动提取 schema。
"""

import json
from strands import tool
from devices import (
    device_states, get_device_ids, get_state, update_state,
    resolve_nickname, DEVICE_REGISTRY, NICKNAMES,
)


@tool
def control_light(device_ids: list[str], on: bool | None = None,
                  brightness: int | None = None, color: str | None = None) -> str:
    """Control one or more smart lights. Can set power, brightness (0-100), and color (hex).

    Args:
        device_ids: List of device IDs. Use ["all"] for all devices.
        on: Power state — true to turn on, false to turn off.
        brightness: Brightness level 0-100.
        color: Color as hex string, e.g. #ef4444.
    """
    ids = get_device_ids(device_ids)
    results = [update_state(d, on=on, brightness=brightness, color=color) for d in ids]
    return json.dumps({"success": True, "results": results})


@tool
def query_lights(device_ids: list[str]) -> str:
    """Query current status of smart lights.

    Args:
        device_ids: List of device IDs. Use ["all"] for all devices.
    """
    ids = get_device_ids(device_ids)
    return json.dumps({"devices": [get_state(d) for d in ids]})


@tool
def discover_devices(filter: str = "all") -> str:
    """Discover all available smart light devices and their capabilities.

    Args:
        filter: Filter by status — "all", "online", or "offline".
    """
    devices = []
    for did, info in DEVICE_REGISTRY.items():
        state = device_states.get(did, {})
        online = state.get("online", True)
        if filter == "online" and not online:
            continue
        if filter == "offline" and online:
            continue
        devices.append({"id": did, **info, "online": online})
    return json.dumps({"count": len(devices), "devices": devices})


@tool
def resolve_device_name(name: str) -> str:
    """Resolve a user-friendly device name or nickname (Chinese/English) to a device ID.

    Args:
        name: Device name or nickname in any language, e.g. "电视背光", "hex panels".
    """
    did = resolve_nickname(name)
    if did:
        return json.dumps({"success": True, "input": name, "device_id": did})
    return json.dumps({"success": False, "input": name, "available": list(NICKNAMES.keys())})

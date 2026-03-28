# Light Assistant — API Reference

Production: `https://dadklele7a855.cloudfront.net`
Local: `http://localhost:8080`

---

## Health Check

### `GET /api/health`

Returns server status.

**Response**
```json
{ "status": "ok", "timestamp": "2026-03-26T09:00:00.000Z" }
```

---

## Devices

### `GET /api/devices`

List all devices with their current state.

**Response**
```json
{
  "devices": [
    {
      "id": "hexa",
      "name": "Hexa Panels",
      "model": "H6066",
      "type": "Glide Hexa Light Panels",
      "online": true,
      "state": {
        "on": false,
        "brightness": 80,
        "color": "#06d6a0"
      }
    }
  ]
}
```

### `GET /api/devices/:id`

Get a single device by ID.

**Path Params**
| Param | Type   | Values                          |
|-------|--------|---------------------------------|
| `id`  | string | `hexa`, `tvb`, `rope`, `ylight` |

**Response** — same shape as one element in the `devices` array above.

**Errors**
| Code | Body                            |
|------|---------------------------------|
| 404  | `{ "error": "device_not_found" }` |

### `PUT /api/devices/:id`

Control a single device. All fields in body are optional — only provided fields are updated.

**Path Params**
| Param | Type   | Values                          |
|-------|--------|---------------------------------|
| `id`  | string | `hexa`, `tvb`, `rope`, `ylight` |

**Request Body**
```json
{
  "on": true,
  "brightness": 85,
  "color": "#ef4444"
}
```

| Field        | Type    | Description                          |
|--------------|---------|--------------------------------------|
| `on`         | boolean | Power on/off                         |
| `brightness` | number  | 0–100                                |
| `color`      | string  | Hex color, e.g. `#ff0000`           |

**Response**
```json
{
  "success": true,
  "device": { "id": "hexa", "name": "...", "online": true, "state": { ... } }
}
```

**Errors**
| Code | Body                            |
|------|---------------------------------|
| 404  | `{ "error": "device_not_found" }` |
| 503  | `{ "error": "device_offline" }`   |

### `PUT /api/devices`

Control **all** devices at once. Same body format as single-device control.

**Request Body**
```json
{ "on": true, "brightness": 80, "color": "#ffffff" }
```

**Response**
```json
{
  "success": true,
  "results": [
    { "id": "hexa", "success": true, "device": { ... } },
    { "id": "tvb", "success": false, "error": "device_offline" }
  ]
}
```

---

## Themes

### `GET /api/themes`

List all available theme presets.

**Response**
```json
{
  "themes": [
    {
      "id": "christmas",
      "name": "Christmas",
      "devices": {
        "hexa":   { "on": true, "color": "#22c55e", "brightness": 90 },
        "tvb":    { "on": true, "color": "#ef4444", "brightness": 85 },
        "rope":   { "on": true, "color": "#f59e0b", "brightness": 80 },
        "ylight": { "on": true, "color": "#ef4444", "brightness": 85 }
      }
    }
  ]
}
```

Available theme IDs: `christmas`, `halloween`, `starry`, `bonfire`, `aurora`, `sunset`

### `POST /api/themes/:id/apply`

Apply a theme preset — sets all devices to the theme's configuration.

**Path Params**
| Param | Type   | Values                                                         |
|-------|--------|----------------------------------------------------------------|
| `id`  | string | `christmas`, `halloween`, `starry`, `bonfire`, `aurora`, `sunset` |

**Response**
```json
{
  "success": true,
  "theme": "christmas",
  "results": [
    { "id": "hexa", "success": true, "device": { ... } }
  ]
}
```

**Errors**
| Code | Body                            |
|------|---------------------------------|
| 404  | `{ "error": "theme_not_found" }` |

---

## Device Online Status (Testing)

### `PATCH /api/devices/:id/online`

Simulate a device going online or offline. Useful for testing offline error handling.

**Request Body**
```json
{ "online": false }
```

**Response**
```json
{ "success": true, "device": { ... } }
```

---

## AI Chat (SSE Streaming)

### `POST /api/chat`

Send a natural language message. The response is a **Server-Sent Events** stream.

**Request Body**
```json
{ "message": "Turn on all lights" }
```

**Response** — `Content-Type: text/event-stream`

Each event is a JSON object prefixed with `data: `:

```
data: {"text":"Done"}
data: {"text":"! All"}
data: {"text":" lights"}
data: {"text":" turned on."}
data: {"done":true,"refreshStatus":true,"devices":{"hexa":{"on":true,"brightness":80,"color":"#06d6a0"},"tvb":{"on":true,"brightness":75,"color":"#8b5cf6"},"rope":{"on":true,"brightness":80,"color":"#f59e0b"},"ylight":{"on":true,"brightness":70,"color":"#ef4444"}}}
```

**Stream Events**

| Field      | Type    | Description                                               |
|------------|---------|-----------------------------------------------------------|
| `text`     | string  | Incremental text chunk (streamed character by character)   |
| `done`     | boolean | `true` on the final event                                 |
| `devices`  | object  | Full device state map (included in the final `done` event) |
| `error`    | string  | Error message if something went wrong                     |

**Supported Commands** (AI agent with Kimi K2.5):

| Intent                  | Example (EN)                    | Example (CN)         |
|-------------------------|---------------------------------|----------------------|
| Turn on                 | "Turn on all lights"            | "打开所有灯"         |
| Turn off                | "Turn off TV backlight"         | "关闭电视背光"       |
| Set color               | "Set hexa panels to blue"       | "把六边形设为蓝色"   |
| Set brightness          | "Brightness 50"                 | "亮度调到50"         |
| Apply theme             | "Apply Christmas theme"         | "应用圣诞主题"       |
| Query status            | "What's the status?"            | "灯光什么状态？"     |
| Multi-turn follow-up    | "Change it to red"              | "把它改成红色"       |

---

## Device ID Reference

| ID       | Name              | Model  | Product                     |
|----------|-------------------|--------|-----------------------------|
| `hexa`   | Hexa Panels       | H6066  | Glide Hexa Light Panels |
| `tvb`    | TV Backlight T2   | H605C  | Envisual TV Backlight   |
| `rope`   | Neon Rope 2       | H61D3  | Neon Rope Light 2       |
| `ylight` | Y Lights          | H6609  | Glide RGBIC Y Lights    |

---

## SSE Device Stream

### `GET /api/devices/stream`

Real-time device state push via Server-Sent Events. Sends current state on connect, then pushes on every change.

**Response** — `Content-Type: text/event-stream`

```
data: {"hexa":{"on":true,"brightness":80,"color":"#06d6a0"},"tvb":{"on":false,"brightness":75,"color":"#8b5cf6"},...}
```

Used by the frontend for cross-tab sync and real-time updates from tool calls.

---

## Quick Start

```bash
cd light_assistant
npm install
AGENTCORE_ARN=arn:aws:bedrock-agentcore:... npm run dev
# http://localhost:8080
```

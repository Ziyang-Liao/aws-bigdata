/**
 * Light Assistant — Mock Backend
 *
 * Provides REST APIs to query and control 4 virtual smart lights,
 * plus a mock AI chat endpoint (SSE streaming).
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

const PORT = process.env.PORT || 8080;

// ============================================================
//  In-memory device store
// ============================================================

const DEVICES = {
  hexa: {
    id: 'hexa',
    name: 'Hexa Panels',
    model: 'H6066',
    type: 'Glide Hexa Light Panels',
    online: true,
    state: { on: false, brightness: 80, color: '#06d6a0' },
  },
  tvb: {
    id: 'tvb',
    name: 'TV Backlight T2',
    model: 'H605C',
    type: 'Envisual TV Backlight',
    online: true,
    state: { on: false, brightness: 75, color: '#8b5cf6' },
  },
  rope: {
    id: 'rope',
    name: 'Neon Rope 2',
    model: 'H61D3',
    type: 'Neon Rope Light 2',
    online: true,
    state: { on: false, brightness: 80, color: '#f59e0b' },
  },
  ylight: {
    id: 'ylight',
    name: 'Y Lights',
    model: 'H6609',
    type: 'Glide RGBIC Y Lights',
    online: true,
    state: { on: false, brightness: 70, color: '#ef4444' },
  },
};

// Theme presets (server-side definition)
const THEMES = {
  christmas: {
    name: 'Christmas',
    devices: {
      hexa:   { on: true, color: '#22c55e', brightness: 90 },
      tvb:    { on: true, color: '#ef4444', brightness: 85 },
      rope:   { on: true, color: '#f59e0b', brightness: 80 },
      ylight: { on: true, color: '#ef4444', brightness: 85 },
    },
  },
  halloween: {
    name: 'Halloween',
    devices: {
      hexa:   { on: true, color: '#a855f7', brightness: 75 },
      tvb:    { on: true, color: '#f97316', brightness: 80 },
      rope:   { on: true, color: '#22c55e', brightness: 70 },
      ylight: { on: true, color: '#f97316', brightness: 75 },
    },
  },
  starry: {
    name: 'Starry Sky',
    devices: {
      hexa:   { on: true, color: '#c084fc', brightness: 60 },
      tvb:    { on: true, color: '#1e40af', brightness: 70 },
      rope:   { on: true, color: '#ffffff', brightness: 50 },
      ylight: { on: true, color: '#3b82f6', brightness: 65 },
    },
  },
  bonfire: {
    name: 'Bonfire',
    devices: {
      hexa:   { on: true, color: '#f97316', brightness: 85 },
      tvb:    { on: true, color: '#ef4444', brightness: 80 },
      rope:   { on: true, color: '#eab308', brightness: 75 },
      ylight: { on: true, color: '#ef4444', brightness: 80 },
    },
  },
  aurora: {
    name: 'Aurora',
    devices: {
      hexa:   { on: true, color: '#06d6a0', brightness: 80 },
      tvb:    { on: true, color: '#3b82f6', brightness: 75 },
      rope:   { on: true, color: '#c084fc', brightness: 70 },
      ylight: { on: true, color: '#06d6a0', brightness: 75 },
    },
  },
  sunset: {
    name: 'Sunset Glow',
    devices: {
      hexa:   { on: true, color: '#ec4899', brightness: 80 },
      tvb:    { on: true, color: '#f97316', brightness: 85 },
      rope:   { on: true, color: '#7c3aed', brightness: 70 },
      ylight: { on: true, color: '#f97316', brightness: 80 },
    },
  },
};

// ============================================================
//  Helper
// ============================================================

function deviceSummary(dev) {
  return {
    id: dev.id,
    name: dev.name,
    model: dev.model,
    type: dev.type,
    online: dev.online,
    state: { ...dev.state },
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ============================================================
//  API Routes
// ============================================================

// --- Health ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- List all devices ---
app.get('/api/devices', (_req, res) => {
  const list = Object.values(DEVICES).map(deviceSummary);
  res.json({ devices: list });
});

// --- Get single device ---
app.get('/api/devices/:id', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  res.json(deviceSummary(dev));
});

// --- Control single device ---
app.put('/api/devices/:id', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  if (!dev.online) return res.status(503).json({ error: 'device_offline', message: `${dev.name} is currently offline` });

  const { on, brightness, color } = req.body;
  if (typeof on === 'boolean') dev.state.on = on;
  if (typeof brightness === 'number') dev.state.brightness = Math.max(0, Math.min(100, brightness));
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) dev.state.color = color;

  console.log(`[Control] ${dev.name}: on=${dev.state.on} brightness=${dev.state.brightness} color=${dev.state.color}`);
  res.json({ success: true, device: deviceSummary(dev) });
});

// --- Control all devices at once ---
app.put('/api/devices', (req, res) => {
  const { on, brightness, color } = req.body;
  const results = [];
  for (const dev of Object.values(DEVICES)) {
    if (!dev.online) { results.push({ id: dev.id, success: false, error: 'device_offline' }); continue; }
    if (typeof on === 'boolean') dev.state.on = on;
    if (typeof brightness === 'number') dev.state.brightness = Math.max(0, Math.min(100, brightness));
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) dev.state.color = color;
    results.push({ id: dev.id, success: true, device: deviceSummary(dev) });
  }
  console.log(`[Control All] on=${on} brightness=${brightness} color=${color}`);
  res.json({ success: true, results });
});

// --- Apply theme ---
app.post('/api/themes/:id/apply', (req, res) => {
  const theme = THEMES[req.params.id];
  if (!theme) return res.status(404).json({ error: 'theme_not_found', message: `Theme "${req.params.id}" not found` });

  const results = [];
  for (const [devId, cfg] of Object.entries(theme.devices)) {
    const dev = DEVICES[devId];
    if (!dev) continue;
    if (!dev.online) { results.push({ id: devId, success: false, error: 'device_offline' }); continue; }
    dev.state.on = cfg.on;
    dev.state.brightness = cfg.brightness;
    dev.state.color = cfg.color;
    results.push({ id: devId, success: true, device: deviceSummary(dev) });
  }
  console.log(`[Theme] Applied: ${theme.name}`);
  res.json({ success: true, theme: req.params.id, results });
});

// --- List themes ---
app.get('/api/themes', (_req, res) => {
  const list = Object.entries(THEMES).map(([id, t]) => ({
    id,
    name: t.name,
    devices: t.devices,
  }));
  res.json({ themes: list });
});

// --- Set device online/offline (for testing) ---
app.patch('/api/devices/:id/online', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  const { online } = req.body;
  if (typeof online !== 'boolean') return res.status(400).json({ error: 'invalid_param', message: '"online" must be a boolean' });
  dev.online = online;
  console.log(`[Online] ${dev.name}: online=${online}`);
  res.json({ success: true, device: deviceSummary(dev) });
});

// ============================================================
//  Mock AI Chat (SSE Streaming)
// ============================================================

/**
 * Parses the user message and returns a mock AI response.
 * Recognizes simple commands like "turn on/off", "set color", "set brightness",
 * "apply theme", "status/query" and responds in the same language.
 */
function parseChatIntent(message) {
  const m = message.toLowerCase();
  const actions = [];

  // Detect language (simple heuristic)
  const isChinese = /[\u4e00-\u9fff]/.test(message);

  // Device name mapping
  const deviceKeywords = {
    hexa:   ['hexa', 'hex', '六边形', '六角', 'panels'],
    tvb:    ['tv', 'backlight', '电视', '背光'],
    rope:   ['rope', 'neon', '绳灯', '霓虹', '麋鹿', 'deer'],
    ylight: ['y light', 'y灯', 'ylight', 'starburst', '星芒'],
  };

  // Theme mapping
  const themeKeywords = {
    christmas: ['christmas', '圣诞'],
    halloween: ['halloween', '万圣'],
    starry:    ['starry', '星空', 'star sky'],
    bonfire:   ['bonfire', '篝火', 'fire'],
    aurora:    ['aurora', '极光', 'northern light'],
    sunset:    ['sunset', '日落', '晚霞'],
  };

  // Check for theme
  for (const [themeId, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(k => m.includes(k))) {
      const theme = THEMES[themeId];
      for (const [devId, cfg] of Object.entries(theme.devices)) {
        const dev = DEVICES[devId];
        dev.state.on = cfg.on;
        dev.state.brightness = cfg.brightness;
        dev.state.color = cfg.color;
      }
      const reply = isChinese
        ? `已为您应用「${theme.name}」主题！所有灯光已调整到${theme.name}氛围设置。`
        : `Applied the "${theme.name}" theme! All lights have been adjusted.`;
      return { reply, deviceChanges: Object.keys(theme.devices) };
    }
  }

  // Identify target devices
  let targetDevices = [];
  for (const [devId, keywords] of Object.entries(deviceKeywords)) {
    if (keywords.some(k => m.includes(k))) {
      targetDevices.push(devId);
    }
  }
  // "all" / "所有" / no specific device mentioned with an action
  const allKeywords = ['all', '所有', '全部', 'every'];
  const isAll = allKeywords.some(k => m.includes(k));
  if (isAll || targetDevices.length === 0) {
    targetDevices = Object.keys(DEVICES);
  }

  // Check for query/status
  const queryKeywords = ['status', 'state', 'query', '状态', '查询', '怎么样', 'what', 'how'];
  if (queryKeywords.some(k => m.includes(k))) {
    const lines = targetDevices.map(id => {
      const d = DEVICES[id];
      const onStr = d.state.on ? (isChinese ? '开启' : 'ON') : (isChinese ? '关闭' : 'OFF');
      return isChinese
        ? `- **${d.name}**: ${onStr}，亮度 ${d.state.brightness}%，颜色 ${d.state.color}`
        : `- **${d.name}**: ${onStr}, brightness ${d.state.brightness}%, color ${d.state.color}`;
    });
    const header = isChinese ? '当前灯光状态：' : 'Current light status:';
    return { reply: `${header}\n${lines.join('\n')}`, deviceChanges: [] };
  }

  // Power on/off
  const turnOn = /\b(turn on|open|on|打开|开灯|开启|开)\b/.test(m);
  const turnOff = /\b(turn off|close|off|关闭|关灯|关掉|关)\b/.test(m);

  // Brightness
  const brMatch = m.match(/(?:brightness|亮度)[^\d]*(\d+)/);
  const brPercent = brMatch ? Math.max(0, Math.min(100, parseInt(brMatch[1], 10))) : null;

  // Color
  const colorNames = {
    red: '#ef4444', '红': '#ef4444',
    orange: '#f97316', '橙': '#f97316',
    yellow: '#eab308', '黄': '#eab308',
    green: '#22c55e', '绿': '#22c55e',
    teal: '#06d6a0', '青': '#06d6a0',
    blue: '#3b82f6', '蓝': '#3b82f6',
    purple: '#8b5cf6', '紫': '#8b5cf6',
    pink: '#ec4899', '粉': '#ec4899',
    white: '#ffffff', '白': '#ffffff',
  };
  let colorVal = null;
  const hexMatch = m.match(/#[0-9a-f]{6}/i);
  if (hexMatch) {
    colorVal = hexMatch[0];
  } else {
    for (const [name, hex] of Object.entries(colorNames)) {
      if (m.includes(name)) { colorVal = hex; break; }
    }
  }

  // Apply changes
  const changed = [];
  for (const devId of targetDevices) {
    const dev = DEVICES[devId];
    if (!dev.online) continue;
    let didChange = false;
    if (turnOn) { dev.state.on = true; didChange = true; }
    if (turnOff) { dev.state.on = false; didChange = true; }
    if (brPercent !== null) { dev.state.brightness = brPercent; didChange = true; }
    if (colorVal) { dev.state.color = colorVal; didChange = true; }
    if (didChange) changed.push(devId);
  }

  // Build reply
  if (changed.length === 0) {
    const reply = isChinese
      ? '抱歉，我没有完全理解您的指令。您可以试试：\n- "打开所有灯"\n- "把 TV 背光设为蓝色"\n- "亮度调到 50"\n- "应用圣诞主题"'
      : 'Sorry, I didn\'t fully understand. You can try:\n- "Turn on all lights"\n- "Set TV backlight to blue"\n- "Set brightness to 50"\n- "Apply Christmas theme"';
    return { reply, deviceChanges: [] };
  }

  const parts = [];
  if (turnOn) parts.push(isChinese ? '开启' : 'turned on');
  if (turnOff) parts.push(isChinese ? '关闭' : 'turned off');
  if (brPercent !== null) parts.push(isChinese ? `亮度设为 ${brPercent}%` : `brightness set to ${brPercent}%`);
  if (colorVal) parts.push(isChinese ? `颜色设为 ${colorVal}` : `color set to ${colorVal}`);

  const deviceNames = changed.map(id => DEVICES[id].name).join(', ');
  const reply = isChinese
    ? `已完成！${deviceNames} ${parts.join('，')}。`
    : `Done! ${deviceNames} — ${parts.join(', ')}.`;

  return { reply, deviceChanges: changed };
}

app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'missing_message' });

  console.log(`[Chat] User: ${message}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { reply, deviceChanges } = parseChatIntent(message);

  // Stream the reply character by character with small delays to simulate LLM streaming
  let i = 0;
  const chunkSize = 3; // characters per chunk
  const interval = setInterval(() => {
    if (i >= reply.length) {
      clearInterval(interval);
      // Send final event with device state changes
      const devices = {};
      for (const devId of Object.keys(DEVICES)) {
        devices[devId] = { ...DEVICES[devId].state };
      }
      res.write(`data: ${JSON.stringify({ done: true, refreshStatus: true, devices })}\n\n`);
      res.end();
      return;
    }
    const chunk = reply.slice(i, i + chunkSize);
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    i += chunkSize;
  }, 30);

  req.on('close', () => clearInterval(interval));
});

// ============================================================
//  Start
// ============================================================

app.listen(PORT, () => {
  console.log(`Light Assistant mock server running on http://localhost:${PORT}`);
  console.log(`Devices: ${Object.values(DEVICES).map(d => d.name).join(', ')}`);
});

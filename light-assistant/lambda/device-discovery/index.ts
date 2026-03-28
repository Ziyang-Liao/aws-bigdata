/**
 * Skill: Device Discovery
 * Lambda handler for discover_devices and resolve_device_name tools.
 */

const EC2_BASE_URL = process.env.EC2_BASE_URL || 'http://localhost:8080';

async function callAPI(method: string, path: string): Promise<unknown> {
  const resp = await fetch(`${EC2_BASE_URL}${path}`, { method, headers: { 'Content-Type': 'application/json' } });
  return resp.json();
}

// Nickname → device ID mapping (bilingual)
const NICKNAME_MAP: Record<string, string> = {
  // hexa
  hexa: 'hexa', hex: 'hexa', panels: 'hexa', hexagonal: 'hexa',
  '六边形': 'hexa', '六角': 'hexa', '灯板': 'hexa',
  // tvb
  tv: 'tvb', tvb: 'tvb', backlight: 'tvb', television: 'tvb',
  '电视': 'tvb', '背光': 'tvb', '电视背光': 'tvb',
  // rope
  rope: 'tvb', neon: 'rope', '绳灯': 'rope', '霓虹': 'rope', '麋鹿': 'rope', deer: 'rope',
  // ylight
  ylight: 'ylight', 'y light': 'ylight', star: 'ylight', starburst: 'ylight',
  'y灯': 'ylight', '星芒': 'ylight',
  // all
  all: 'all', '所有': 'all', '全部': 'all', every: 'all', everything: 'all',
};

async function discoverDevices(input: Record<string, unknown>) {
  const filter = (input.filter as string) || 'all';
  const data = await callAPI('GET', '/api/devices') as { devices: Array<{ id: string; online: boolean; [k: string]: unknown }> };

  let devices = data.devices;
  if (filter === 'online') devices = devices.filter(d => d.online);
  if (filter === 'offline') devices = devices.filter(d => !d.online);

  return {
    success: true,
    count: devices.length,
    devices,
    available_nicknames: Object.entries(NICKNAME_MAP).reduce((acc, [nick, id]) => {
      if (id !== 'all') (acc[id] ??= []).push(nick);
      return acc;
    }, {} as Record<string, string[]>),
  };
}

async function resolveDeviceName(input: Record<string, unknown>) {
  const name = ((input.name as string) || '').toLowerCase().trim();

  // Exact match
  if (NICKNAME_MAP[name]) {
    return { success: true, input: name, device_id: NICKNAME_MAP[name] };
  }

  // Fuzzy: check if any nickname is contained in the input
  for (const [nick, id] of Object.entries(NICKNAME_MAP)) {
    if (name.includes(nick) || nick.includes(name)) {
      return { success: true, input: name, device_id: id, matched_nickname: nick };
    }
  }

  return { success: false, input: name, error: 'no_match', available: Object.keys(NICKNAME_MAP) };
}

const HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  discover_devices: discoverDevices,
  resolve_device_name: resolveDeviceName,
};

export async function handler(event: Record<string, unknown>) {
  const toolName = (event.name || event.toolName || inferTool(event)) as string;
  const input = (event.arguments || event.input || event) as Record<string, unknown>;

  const fn = HANDLERS[toolName];
  if (!fn) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_tool', tool: toolName }) }], isError: true };
  }

  try {
    const result = await fn(input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: 'tool_error', message: err?.message }) }], isError: true };
  }
}

function inferTool(event: Record<string, unknown>): string {
  if ('filter' in event) return 'discover_devices';
  if ('name' in event) return 'resolve_device_name';
  return '';
}

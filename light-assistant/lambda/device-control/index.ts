/**
 * Skill: Device Control
 * Lambda handler for control_light and query_lights tools.
 */

const EC2_BASE_URL = process.env.EC2_BASE_URL || 'http://localhost:8080';

async function callAPI(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${EC2_BASE_URL}${path}`;
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  return resp.json();
}

async function controlLight(input: Record<string, unknown>) {
  const { device_ids, on, brightness, color } = input as {
    device_ids: string[]; on?: boolean; brightness?: number; color?: string;
  };

  const body: Record<string, unknown> = {};
  if (on !== undefined) body.on = on;
  if (brightness !== undefined) body.brightness = brightness;
  if (color !== undefined) body.color = color;

  if (device_ids.includes('all')) {
    return callAPI('PUT', '/api/devices', body);
  }

  const results = await Promise.all(
    device_ids.map(async (id) => ({ id, ...(await callAPI('PUT', `/api/devices/${id}`, body) as object) }))
  );
  return { success: true, results };
}

async function queryLights(input: Record<string, unknown>) {
  const { device_ids } = input as { device_ids: string[] };

  if (device_ids.includes('all')) {
    return callAPI('GET', '/api/devices');
  }

  const results = await Promise.all(device_ids.map((id) => callAPI('GET', `/api/devices/${id}`)));
  return { success: true, devices: results };
}

const HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  control_light: controlLight,
  query_lights: queryLights,
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
  if ('on' in event || 'brightness' in event || 'color' in event) return 'control_light';
  if ('device_ids' in event) return 'query_lights';
  return '';
}

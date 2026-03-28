/**
 * Lambda function — Light Tools
 *
 * Proxies tool calls from AgentCore Gateway to the EC2 Express REST API.
 * Handles 3 tools: control_light, query_lights, apply_theme.
 *
 * Environment variables:
 *   EC2_BASE_URL — e.g. "http://172.31.x.x:8080" (EC2 private IP)
 */

const EC2_BASE_URL = process.env.EC2_BASE_URL || 'http://localhost:8080';

interface LambdaEvent {
  // MCP tools/call format (from AgentCore Gateway)
  name?: string;
  arguments?: Record<string, unknown>;
  // Legacy format
  toolName?: string;
  input?: Record<string, unknown>;
}

async function callEC2(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${EC2_BASE_URL}${path}`;
  const t0 = Date.now();
  console.log(`[Lambda] EC2 call: ${method} ${url}${body ? ' body=' + JSON.stringify(body) : ''}`);

  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  const data = await resp.json();
  const elapsed = Date.now() - t0;

  console.log(`[Lambda] EC2 response: ${resp.status} ${elapsed}ms ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// ── Tool Handlers ──────────────────────────────────────────────

async function handleControlLight(input: Record<string, unknown>) {
  const { device_ids, on, brightness, color } = input as {
    device_ids: string[];
    on?: boolean;
    brightness?: number;
    color?: string;
  };

  const ids = device_ids.includes('all') ? ['hexa', 'tvb', 'rope', 'ylight'] : device_ids;
  const body: Record<string, unknown> = {};
  if (on !== undefined) body.on = on;
  if (brightness !== undefined) body.brightness = brightness;
  if (color !== undefined) body.color = color;

  console.log(`[Lambda] control_light: ids=${JSON.stringify(ids)} body=${JSON.stringify(body)}`);

  if (ids.length === 4 || device_ids.includes('all')) {
    return callEC2('PUT', '/api/devices', body);
  }

  const results = await Promise.all(
    ids.map(async (id) => {
      const result = await callEC2('PUT', `/api/devices/${id}`, body);
      return { id, ...(result as object) };
    })
  );
  return { success: true, results };
}

async function handleQueryLights(input: Record<string, unknown>) {
  const { device_ids } = input as { device_ids: string[] };
  console.log(`[Lambda] query_lights: ids=${JSON.stringify(device_ids)}`);

  if (device_ids.includes('all')) {
    return callEC2('GET', '/api/devices');
  }

  const results = await Promise.all(
    device_ids.map(async (id) => {
      const result = await callEC2('GET', `/api/devices/${id}`);
      return result;
    })
  );
  return { success: true, devices: results };
}

async function handleApplyTheme(input: Record<string, unknown>) {
  const { theme_id } = input as { theme_id: string };
  console.log(`[Lambda] apply_theme: theme=${theme_id}`);
  return callEC2('POST', `/api/themes/${theme_id}/apply`);
}

// ── Lambda Handler ─────────────────────────────────────────────

const TOOL_HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  control_light: handleControlLight,
  query_lights: handleQueryLights,
  apply_theme: handleApplyTheme,
};

/**
 * Infer tool name from event shape.
 * Gateway sends only arguments — no tool name wrapper.
 */
function inferTool(event: Record<string, unknown>): string {
  if ('theme_id' in event) return 'apply_theme';
  if ('on' in event || 'brightness' in event || 'color' in event) return 'control_light';
  if ('device_ids' in event) return 'query_lights';
  return '';
}

export async function handler(event: LambdaEvent) {
  const t0 = Date.now();
  console.log(`[Lambda] ── Invocation Start ──`);
  console.log(`[Lambda] Raw event: ${JSON.stringify(event)}`);

  // Try explicit name fields first, then infer from shape
  const toolName = event.name || event.toolName || inferTool(event as Record<string, unknown>);
  const input = event.arguments || event.input || event;

  console.log(`[Lambda] Resolved tool: "${toolName}" input: ${JSON.stringify(input)}`);

  const toolHandler = TOOL_HANDLERS[toolName];
  if (!toolHandler) {
    console.error(`[Lambda] Unknown tool: "${toolName}" keys: [${Object.keys(event)}]`);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'unknown_tool', message: `Tool "${toolName}" not found. Keys: ${Object.keys(event)}` }) }],
      isError: true,
    };
  }

  try {
    const result = await toolHandler(input as Record<string, unknown>);
    const elapsed = Date.now() - t0;
    console.log(`[Lambda] ── Invocation Done ── ${elapsed}ms tool=${toolName}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (err: any) {
    const elapsed = Date.now() - t0;
    console.error(`[Lambda] ── Invocation Error ── ${elapsed}ms tool=${toolName} err=${err?.message}`);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'tool_error', message: err?.message || 'Unknown error' }) }],
      isError: true,
    };
  }
}

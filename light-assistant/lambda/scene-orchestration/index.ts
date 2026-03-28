/**
 * Skill: Scene Orchestration
 * Lambda handler for apply_theme and create_scene tools.
 */

const EC2_BASE_URL = process.env.EC2_BASE_URL || 'http://localhost:8080';

async function callAPI(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${EC2_BASE_URL}${path}`;
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  return resp.json();
}

// Mood → color palette mapping for dynamic scene generation
const MOOD_PALETTES: Record<string, { colors: string[]; brightness: [number, number] }> = {
  romantic:  { colors: ['#ec4899', '#f43f5e', '#e11d48', '#be185d'], brightness: [50, 70] },
  focus:     { colors: ['#3b82f6', '#1e40af', '#1d4ed8', '#2563eb'], brightness: [60, 80] },
  relax:     { colors: ['#06d6a0', '#10b981', '#059669', '#047857'], brightness: [40, 65] },
  party:     { colors: ['#ef4444', '#8b5cf6', '#06d6a0', '#f59e0b'], brightness: [80, 100] },
  movie:     { colors: ['#1e1b4b', '#312e81', '#3730a3', '#4338ca'], brightness: [20, 40] },
  morning:   { colors: ['#fef3c7', '#fde68a', '#fcd34d', '#fbbf24'], brightness: [60, 85] },
  sleep:     { colors: ['#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'], brightness: [10, 30] },
  energetic: { colors: ['#f97316', '#ef4444', '#eab308', '#22c55e'], brightness: [75, 95] },
};

const DEVICE_IDS = ['hexa', 'tvb', 'rope', 'ylight'];

function matchMood(description: string): string {
  const lower = description.toLowerCase();
  const keywords: Record<string, string[]> = {
    romantic:  ['romantic', 'love', 'dinner', 'date', '浪漫', '约会', '烛光'],
    focus:     ['focus', 'work', 'study', 'concentrate', '专注', '工作', '学习'],
    relax:     ['relax', 'calm', 'chill', 'zen', '放松', '平静', '冥想'],
    party:     ['party', 'dance', 'fun', 'celebrate', '派对', '庆祝', '嗨'],
    movie:     ['movie', 'cinema', 'film', 'theater', '电影', '影院', '观影'],
    morning:   ['morning', 'sunrise', 'wake', 'bright', '早晨', '日出', '明亮'],
    sleep:     ['sleep', 'night', 'bedtime', 'dream', '睡眠', '晚安', '入睡'],
    energetic: ['energy', 'sport', 'exercise', 'active', '运动', '活力', '健身'],
  };

  for (const [mood, words] of Object.entries(keywords)) {
    if (words.some(w => lower.includes(w))) return mood;
  }
  return 'relax'; // default
}

async function applyTheme(input: Record<string, unknown>) {
  const { theme_id } = input as { theme_id: string };
  return callAPI('POST', `/api/themes/${theme_id}/apply`);
}

async function createScene(input: Record<string, unknown>) {
  const { description, brightness_range } = input as {
    description: string;
    brightness_range?: { min?: number; max?: number };
  };

  const mood = matchMood(description);
  const palette = MOOD_PALETTES[mood];

  const bMin = brightness_range?.min ?? palette.brightness[0];
  const bMax = brightness_range?.max ?? palette.brightness[1];

  // Apply generated scene to all devices
  const body: Record<string, unknown>[] = DEVICE_IDS.map((id, i) => ({
    on: true,
    color: palette.colors[i % palette.colors.length],
    brightness: Math.round(bMin + (bMax - bMin) * (i / (DEVICE_IDS.length - 1))),
  }));

  const results = await Promise.all(
    DEVICE_IDS.map((id, i) => callAPI('PUT', `/api/devices/${id}`, body[i]))
  );

  return {
    success: true,
    scene: { mood, description, palette: palette.colors },
    results: DEVICE_IDS.map((id, i) => ({ id, ...(results[i] as object) })),
  };
}

const HANDLERS: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
  apply_theme: applyTheme,
  create_scene: createScene,
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
  if ('theme_id' in event) return 'apply_theme';
  if ('description' in event) return 'create_scene';
  return '';
}

/**
 * Light Assistant — AgentCore Runtime Entry Point
 *
 * Skill-based architecture: Agent composes capabilities from 3 independent Skills,
 * each exposed as a separate MCP Gateway.
 *
 * Skills:
 *   1. Device Control    — control_light, query_lights
 *   2. Scene Orchestration — apply_theme, create_scene
 *   3. Device Discovery   — discover_devices, resolve_device_name
 */

import { Agent, McpClient, SlidingWindowConversationManager } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/bedrock';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BedrockAgentCoreApp, type RequestContext } from 'bedrock-agentcore/runtime';
import { z } from 'zod';

// ── Configuration ──────────────────────────────────────────────

const SKILL_GATEWAYS = {
  deviceControl:      process.env.AGENTCORE_GATEWAY_DEVICE_CONTROL_URL || '',
  sceneOrchestration: process.env.AGENTCORE_GATEWAY_SCENE_ORCHESTRATION_URL || '',
  deviceDiscovery:    process.env.AGENTCORE_GATEWAY_DEVICE_DISCOVERY_URL || '',
};

const MODEL_ID = process.env.MODEL_ID || 'moonshotai.kimi-k2.5';
const REGION = process.env.AWS_REGION || 'us-east-1';

console.log(`┌─ [Runtime] AgentCore Runtime (Skill-based)`);
console.log(`│  Model:   ${MODEL_ID}`);
console.log(`│  Region:  ${REGION}`);
console.log(`│  Skills:`);
for (const [name, url] of Object.entries(SKILL_GATEWAYS)) {
  console.log(`│    ${name}: ${url || '(not set)'}`);
}
console.log(`└──────────────────────────────────────`);

const SYSTEM_PROMPT = `You are the Light Assistant, a smart home lighting control AI powered by AWS.
You help users control smart lights through natural conversation.

## Your Skills

### Skill 1: Device Discovery
Use these tools FIRST when you need to identify devices or resolve user nicknames.
- **discover_devices** — List all available devices, their capabilities, and online status
- **resolve_device_name** — Resolve a nickname (any language) to a device ID. E.g. "电视背光" → "tvb"

### Skill 2: Device Control
Core light control capabilities.
- **control_light** — Set power (on/off), brightness (0-100), color (hex #rrggbb) for one or more lights
- **query_lights** — Check current status of lights

### Skill 3: Scene Orchestration
Preset and dynamic scene management.
- **apply_theme** — Apply a preset theme: christmas, halloween, starry, bonfire, aurora, sunset
- **create_scene** — Generate a dynamic lighting scene from a natural language description (e.g. "romantic dinner", "movie night")

## Workflow
1. If the user mentions a device by nickname, use **resolve_device_name** first to get the ID
2. Use **control_light** or **query_lights** for direct device operations
3. Use **apply_theme** for preset themes, **create_scene** for custom atmospheres
4. Use **discover_devices** when the user asks "what devices do I have?" or similar

## Color Reference
| Name | Hex | Chinese |
|------|-----|---------|
| Red | #ef4444 | 红色 |
| Orange | #f97316 | 橙色 |
| Yellow | #eab308 | 黄色 |
| Green | #22c55e | 绿色 |
| Teal | #06d6a0 | 青色 |
| Blue | #3b82f6 | 蓝色 |
| Purple | #8b5cf6 | 紫色 |
| Pink | #ec4899 | 粉色 |
| White | #ffffff | 白色 |
| Warm White | #fef3c7 | 暖白 |

## Rules
1. **ALWAYS respond in the same language the user used.**
2. You CAN combine multiple properties in a single control_light call.
3. Report tool results honestly. If a device is offline, tell the user clearly.
4. For ambiguous requests with no specific device, default to ALL devices.
5. Keep responses concise and friendly.
6. If the user asks something unrelated to lighting, politely explain you can only control smart lights.
`;

// ── Model ──────────────────────────────────────────────────────

const model = new BedrockModel({ modelId: MODEL_ID, region: REGION });

// Patch: filter empty text blocks from Strands SDK messages
const origFormatMessages = (model as any)._formatMessages.bind(model);
(model as any)._formatMessages = function(messages: any[]) {
  const formatted = origFormatMessages(messages);
  for (const msg of formatted) {
    if (msg.content && Array.isArray(msg.content)) {
      msg.content = msg.content.filter(
        (block: any) => !(block.text !== undefined && block.text.trim() === '')
      );
    }
  }
  return formatted.filter((msg: any) => msg.content && msg.content.length > 0);
};

// ── Skill-based Agent (lazy init) ─────────────────────────────

let agent: Agent | null = null;
let requestCount = 0;

async function getOrCreateAgent(): Promise<Agent> {
  if (agent) {
    console.log(`[Runtime] Reusing agent (warm, ${agent.messages.length} msgs)`);
    return agent;
  }

  const t0 = Date.now();
  console.log(`[Runtime] Creating agent (cold start) — connecting Skills...`);

  // Connect each Skill as an independent MCP client
  const skillClients: McpClient[] = [];
  for (const [name, url] of Object.entries(SKILL_GATEWAYS)) {
    if (!url) {
      console.warn(`[Runtime] Skill "${name}" gateway not configured, skipping`);
      continue;
    }
    console.log(`[Runtime]   Connecting skill: ${name} → ${url}`);
    const transport = new StreamableHTTPClientTransport(new URL(url));
    skillClients.push(new McpClient({ transport }));
  }

  if (skillClients.length === 0) {
    throw new Error('No Skill gateways configured — set AGENTCORE_GATEWAY_*_URL env vars');
  }

  agent = new Agent({
    model,
    tools: skillClients,
    systemPrompt: SYSTEM_PROMPT,
    conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
  });

  console.log(`[Runtime] Agent ready: ${Date.now() - t0}ms, ${skillClients.length} skills loaded`);
  return agent;
}

// ── Fallback Response Generator ───────────────────────────────

function generateFallback(
  prompt: string,
  toolResults: Array<{ tool: string; input: any; result: any }>
): string {
  const isChinese = /[\u4e00-\u9fff]/.test(prompt);
  const parts: string[] = [];

  for (const { tool, input, result } of toolResults) {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const success = !resultStr.includes('"error"');

    if (tool === 'control_light') {
      const ids = input?.device_ids || [];
      const target = ids.includes('all') ? (isChinese ? '所有灯' : 'all lights') : ids.join(', ');
      const actions: string[] = [];
      if (input?.on === true) actions.push(isChinese ? '开启' : 'turned on');
      if (input?.on === false) actions.push(isChinese ? '关闭' : 'turned off');
      if (input?.brightness !== undefined) actions.push(isChinese ? `亮度${input.brightness}%` : `brightness ${input.brightness}%`);
      if (input?.color) actions.push(isChinese ? `颜色${input.color}` : `color ${input.color}`);
      parts.push(success
        ? (isChinese ? `已为 ${target} ${actions.join('、')}` : `${target}: ${actions.join(', ')}`)
        : (isChinese ? `操作 ${target} 时出现错误` : `Error controlling ${target}`));
    } else if (tool === 'query_lights' || tool === 'discover_devices') {
      parts.push(isChinese ? `灯光状态：${resultStr.slice(0, 500)}` : `Light status: ${resultStr.slice(0, 500)}`);
    } else if (tool === 'apply_theme') {
      const theme = input?.theme_id || '';
      parts.push(success
        ? (isChinese ? `已应用「${theme}」主题` : `Applied "${theme}" theme`)
        : (isChinese ? `应用主题失败` : `Error applying theme`));
    } else if (tool === 'create_scene') {
      parts.push(success
        ? (isChinese ? `已创建自定义场景` : `Custom scene applied`)
        : (isChinese ? `创建场景失败` : `Error creating scene`));
    } else if (tool === 'resolve_device_name') {
      const id = (typeof result === 'object' && result) ? (result as any).device_id : '';
      if (id) parts.push(isChinese ? `识别设备: ${id}` : `Resolved device: ${id}`);
    }
  }

  return parts.join(isChinese ? '；' : '; ') || (isChinese ? '操作完成' : 'Done');
}

// ── Request Schema ─────────────────────────────────────────────

const requestSchema = z.object({ prompt: z.string() });

// ── AgentCore App ──────────────────────────────────────────────

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    process: async function* (request: { prompt: string }, context: RequestContext) {
      const reqId = ++requestCount;
      const t0 = Date.now();
      const { prompt } = request;

      context.log.info(`[Runtime:#${reqId}] Prompt: "${prompt}" Session: ${context.sessionId}`);

      if (!prompt) { yield JSON.stringify({ error: 'missing prompt' }); return; }

      const tAgentStart = Date.now();
      let agentInstance: Agent;
      try {
        agentInstance = await getOrCreateAgent();
      } catch (err: any) {
        context.log.error(`[Runtime:#${reqId}] Agent init failed: ${err.message}`);
        yield JSON.stringify({ error: err.message });
        return;
      }
      const tAgentReady = Date.now();

      let charCount = 0;
      let chunkCount = 0;
      let toolCallCount = 0;
      let tFirstText: number | null = null;
      const toolResults: Array<{ tool: string; input: any; result: any }> = [];

      try {
        const gen = agentInstance.stream(prompt);
        let next = await gen.next();

        while (!next.done) {
          const event = next.value;

          if (event.type === 'toolStreamUpdateEvent') {
            const toolEvent = (event as any).event;
            if (toolEvent?.type === 'beforeToolCallEvent') {
              toolCallCount++;
              const toolName = toolEvent?.tool?.name || 'unknown';
              const toolInput = toolEvent?.toolUse?.input || {};
              context.log.info(`[Runtime:#${reqId}] Tool[${toolName}] call #${toolCallCount}: ${JSON.stringify(toolInput)}`);
              toolResults.push({ tool: toolName, input: toolInput, result: null });
            } else if (toolEvent?.type === 'afterToolCallEvent') {
              const toolName = toolEvent?.tool?.name || 'unknown';
              const result = toolEvent?.result;
              context.log.info(`[Runtime:#${reqId}] Tool[${toolName}] result: ${JSON.stringify(result)?.slice(0, 200)}`);
              const last = toolResults[toolResults.length - 1];
              if (last) last.result = result;
            }
          }

          if (event.type === 'modelStreamUpdateEvent') {
            const modelEvent = (event as any).event;
            if (
              modelEvent?.type === 'modelContentBlockDeltaEvent' &&
              modelEvent?.delta?.type === 'textDelta' &&
              modelEvent?.delta?.text
            ) {
              if (!tFirstText) tFirstText = Date.now();
              chunkCount++;
              charCount += modelEvent.delta.text.length;
              yield modelEvent.delta.text;
            }
          }

          next = await gen.next();
        }
      } catch (err: any) {
        context.log.warn(`[Runtime:#${reqId}] Stream error: ${err?.message}`);
        if (toolCallCount > 0 && charCount === 0) {
          const fallback = generateFallback(prompt, toolResults);
          yield fallback;
          charCount += fallback.length;
        } else if (charCount === 0) {
          yield JSON.stringify({ error: err?.message || 'Agent error' });
        }
      }

      context.log.info(
        `[Runtime:#${reqId}] Done — ${Date.now() - t0}ms total, ` +
        `TTFT=${tFirstText ? tFirstText - t0 : '—'}ms, ` +
        `tools=${toolCallCount}, chars=${charCount}`
      );
    },
  },
});

app.run();

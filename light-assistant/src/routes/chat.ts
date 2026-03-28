import { Router, type Request, type Response } from 'express';
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { getAllDeviceStates } from '../devices.js';

const router = Router();

// ── AgentCore Configuration ───────────────────────────────────

const AGENTCORE_ARN = process.env.AGENTCORE_ARN || '';
if (!AGENTCORE_ARN) {
  console.warn('[Chat] WARNING: AGENTCORE_ARN not set — /api/chat will fail');
}

const agentCoreClient = new BedrockAgentCoreClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// ── Conversation History (Express-side for cross-request context) ──

interface Turn { role: 'user' | 'assistant'; text: string }
const history: Turn[] = [];
const MAX_TURNS = 3; // 1 turn = 1 user + 1 assistant message = 6 entries max

function buildPrompt(message: string): string {
  if (history.length === 0) return message;

  const ctx = history
    .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
    .join('\n');

  return `<conversation_history>\n${ctx}\n</conversation_history>\n\nUser: ${message}`;
}

// ── AgentCore Streaming ───────────────────────────────────────

async function runAgentCore(message: string, res: Response, aborted: () => boolean) {
  const t0 = Date.now();

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn: AGENTCORE_ARN,
    contentType: 'application/json',
    accept: 'text/event-stream',
    payload: Buffer.from(JSON.stringify({ prompt: buildPrompt(message) })),
  });

  const response = await agentCoreClient.send(command);
  const tHeader = Date.now();

  if (!response.response) {
    throw new Error('No response stream from AgentCore');
  }

  const stream = response.response;
  const decoder = new TextDecoder();
  let charCount = 0;
  let chunkCount = 0;
  let tFirstChunk: number | null = null;
  let tFirstText: number | null = null;
  let fullAssistantText = '';

  const readable = stream as unknown as AsyncIterable<Uint8Array>;
  let buffer = '';

  for await (const chunk of readable) {
    if (!tFirstChunk) tFirstChunk = Date.now();
    chunkCount++;
    if (aborted()) break;

    buffer += decoder.decode(chunk, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    const textParts: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5);
        if (payload.trim() === '') {
          textParts.push('\n');
        } else {
          const text = payload.startsWith(' ') ? payload.slice(1) : payload;
          textParts.push(text);
        }
      }
    }

    if (textParts.length > 0) {
      const combined = textParts.join('');
      if (combined.trim()) {
        if (!tFirstText) tFirstText = Date.now();
        charCount += combined.length;
        fullAssistantText += combined;
        res.write(`data: ${JSON.stringify({ text: combined })}\n\n`);
      }
    }
  }

  const tDone = Date.now();

  // Record both turns only after successful response
  history.push({ role: 'user', text: message.slice(0, 500) });
  if (fullAssistantText.trim()) {
    history.push({ role: 'assistant', text: fullAssistantText.slice(0, 500) });
  }

  // Trim history (MAX_TURNS pairs = MAX_TURNS * 2 entries)
  while (history.length > MAX_TURNS * 2) history.shift();

  console.log(`[Chat] History: ${history.length} turns`);

  // ── Latency Log ──
  console.log(`┌─ [Latency] "${message}"`);
  console.log(`│  SDK send → header:   ${tHeader - t0}ms`);
  console.log(`│  Header → 1st chunk:  ${tFirstChunk ? tFirstChunk - tHeader : '—'}ms`);
  console.log(`│  1st chunk → 1st text:${tFirstText && tFirstChunk ? tFirstText - tFirstChunk : '—'}ms`);
  console.log(`│  TTFT (req → 1st text):${tFirstText ? tFirstText - t0 : '—'}ms`);
  console.log(`│  Streaming duration:  ${tFirstText ? tDone - tFirstText : '—'}ms`);
  console.log(`│  Total:               ${tDone - t0}ms`);
  console.log(`│  Chunks: ${chunkCount}, Chars: ${charCount}`);
  console.log(`└──────────────────────────────────────\n`);

  const devices = getAllDeviceStates();
  res.write(`data: ${JSON.stringify({ done: true, refreshStatus: true, devices })}\n\n`);
  res.end();
}

// ── Route ──────────────────────────────────────────────────────

router.post('/api/chat', (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: 'missing_message' });
    return;
  }

  console.log(`[Chat] User: ${message}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let isAborted = false;
  res.on('close', () => { isAborted = true; });
  const aborted = () => isAborted;

  runAgentCore(message, res, aborted).catch(err => {
    console.error('[Chat] Error:', err?.message || err);
    try {
      res.write(`data: ${JSON.stringify({ error: err?.message || 'Agent error' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, devices: getAllDeviceStates() })}\n\n`);
      res.end();
    } catch (_) {}
  });
});

export default router;

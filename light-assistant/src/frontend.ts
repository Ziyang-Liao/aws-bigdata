/**
 * Frontend Server — port 8000
 * Serves static files and proxies /api/* to the backend (port 8080).
 */
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const PORT = process.env.FRONTEND_PORT || 8000;

// Static files
app.use(express.static(path.join(__dirname, '..', 'static')));

// Proxy /api/* to backend
app.all('/api/{*splat}', async (req, res) => {
  const url = `${BACKEND_URL}${req.originalUrl}`;

  const headers: Record<string, string> = { 'content-type': 'application/json' };

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Read raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req as any) {
      chunks.push(Buffer.from(chunk));
    }
    if (chunks.length > 0) {
      init.body = Buffer.concat(chunks);
    }
  }

  try {
    const upstream = await fetch(url, init);

    // Copy status + headers
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'content-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream the response (supports SSE)
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };
    // If client disconnects, abort
    res.on('close', () => reader.cancel());
    await pump();
  } catch (err: any) {
    console.error(`[Proxy] ${req.method} ${req.originalUrl} → ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'backend_unavailable', message: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Frontend server: http://localhost:${PORT}`);
  console.log(`Proxying /api/* → ${BACKEND_URL}`);
});

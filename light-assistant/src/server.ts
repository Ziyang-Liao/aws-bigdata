import express from 'express';
import cors from 'cors';

import deviceRoutes from './routes/devices.js';
import themeRoutes from './routes/themes.js';
import chatRoutes from './routes/chat.js';

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Request logging middleware
app.use((req, _res, next) => {
  if (req.path !== '/api/health' && req.path !== '/api/devices/stream') {
    console.log(`[Express] ${req.method} ${req.path}`);
  }
  next();
});

// Routes
app.use(deviceRoutes);
app.use(themeRoutes);
app.use(chatRoutes);

const PORT = process.env.PORT || 8080;
const AGENTCORE_ARN = process.env.AGENTCORE_ARN || '';

app.listen(PORT, () => {
  console.log(`┌─ [Express] Light Assistant Backend`);
  console.log(`│  Port:       ${PORT}`);
  console.log(`│  AgentCore:  ${AGENTCORE_ARN || '(not set — /api/chat will fail)'}`);
  console.log(`│  Region:     ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`└──────────────────────────────────────`);
});

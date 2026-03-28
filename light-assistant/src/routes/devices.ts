import { Router } from 'express';
import { DEVICES, deviceSummary, persistDevices, getAllDeviceStates, deviceEvents } from '../devices.js';

const router = Router();

// SSE: push device state changes to all connected clients
router.get('/api/devices/stream', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify(getAllDeviceStates())}\n\n`);

  const onChange = (states: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(states)}\n\n`);
  };

  deviceEvents.on('change', onChange);
  res.on('close', () => {
    deviceEvents.off('change', onChange);
  });
});

router.get('/api/devices', (_req, res) => {
  const list = Object.values(DEVICES).map(deviceSummary);
  res.json({ devices: list });
});

router.get('/api/devices/:id', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  res.json(deviceSummary(dev));
});

router.put('/api/devices/:id', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  if (!dev.online) return res.status(503).json({ error: 'device_offline', message: `${dev.name} is currently offline` });

  const { on, brightness, color } = req.body;
  if (typeof on === 'boolean') dev.state.on = on;
  if (typeof brightness === 'number') dev.state.brightness = Math.max(0, Math.min(100, brightness));
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) dev.state.color = color;

  console.log(`[Control] ${dev.name}: on=${dev.state.on} brightness=${dev.state.brightness} color=${dev.state.color}`);
  persistDevices();
  res.json({ success: true, device: deviceSummary(dev) });
});

router.put('/api/devices', (req, res) => {
  const { on, brightness, color } = req.body;
  const results = Object.values(DEVICES).map(dev => {
    if (!dev.online) return { id: dev.id, success: false, error: 'device_offline' };
    if (typeof on === 'boolean') dev.state.on = on;
    if (typeof brightness === 'number') dev.state.brightness = Math.max(0, Math.min(100, brightness));
    if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) dev.state.color = color;
    return { id: dev.id, success: true, device: deviceSummary(dev) };
  });
  persistDevices();
  res.json({ success: true, results });
});

router.patch('/api/devices/:id/online', (req, res) => {
  const dev = DEVICES[req.params.id];
  if (!dev) return res.status(404).json({ error: 'device_not_found', message: `Device "${req.params.id}" not found` });
  const { online } = req.body;
  if (typeof online !== 'boolean') return res.status(400).json({ error: 'invalid_param', message: '"online" must be a boolean' });
  dev.online = online;
  console.log(`[Online] ${dev.name}: online=${online}`);
  persistDevices();
  res.json({ success: true, device: deviceSummary(dev) });
});

export default router;

import { Router } from 'express';
import { DEVICES, THEMES, deviceSummary, persistDevices } from '../devices.js';

const router = Router();

router.get('/api/themes', (_req, res) => {
  const list = Object.entries(THEMES).map(([id, t]) => ({
    id,
    name: t.name,
    devices: t.devices,
  }));
  res.json({ themes: list });
});

router.post('/api/themes/:id/apply', (req, res) => {
  const theme = THEMES[req.params.id];
  if (!theme) return res.status(404).json({ error: 'theme_not_found', message: `Theme "${req.params.id}" not found` });

  const results = Object.entries(theme.devices).map(([devId, cfg]) => {
    const dev = DEVICES[devId];
    if (!dev) return { id: devId, success: false, error: 'device_not_found' };
    if (!dev.online) return { id: devId, success: false, error: 'device_offline' };
    dev.state.on = cfg.on;
    dev.state.brightness = cfg.brightness;
    dev.state.color = cfg.color;
    return { id: devId, success: true, device: deviceSummary(dev) };
  });

  console.log(`[Theme] Applied: ${theme.name}`);
  persistDevices();
  res.json({ success: true, theme: req.params.id, results });
});

export default router;

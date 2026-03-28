import { EventEmitter } from 'events';
import { loadState, saveState } from './store.js';

// SSE broadcast: emits 'change' with full device states whenever state is persisted
export const deviceEvents = new EventEmitter();

export interface DeviceState {
  on: boolean;
  brightness: number;
  color: string;
}

export interface Device {
  id: string;
  name: string;
  model: string;
  type: string;
  online: boolean;
  state: DeviceState;
}

export interface ThemeConfig {
  name: string;
  devices: Record<string, { on: boolean; color: string; brightness: number }>;
}

const DEFAULT_DEVICES: Record<string, Device> = {
  hexa: {
    id: 'hexa',
    name: 'Hexa Panels',
    model: 'H6066',
    type: 'Glide Hexa Light Panels',
    online: true,
    state: { on: false, brightness: 80, color: '#06d6a0' },
  },
  tvb: {
    id: 'tvb',
    name: 'TV Backlight T2',
    model: 'H605C',
    type: 'Envisual TV Backlight',
    online: true,
    state: { on: false, brightness: 75, color: '#8b5cf6' },
  },
  rope: {
    id: 'rope',
    name: 'Neon Rope 2',
    model: 'H61D3',
    type: 'Neon Rope Light 2',
    online: true,
    state: { on: false, brightness: 80, color: '#f59e0b' },
  },
  ylight: {
    id: 'ylight',
    name: 'Y Lights',
    model: 'H6609',
    type: 'Glide RGBIC Y Lights',
    online: true,
    state: { on: false, brightness: 70, color: '#ef4444' },
  },
};

// Load persisted state or use defaults
export const DEVICES: Record<string, Device> = loadState() ?? structuredClone(DEFAULT_DEVICES);
console.log(`[Store] Loaded device state from ${loadState() ? 'data/devices.json' : 'defaults'}`);

export const THEMES: Record<string, ThemeConfig> = {
  christmas: {
    name: 'Christmas',
    devices: {
      hexa:   { on: true, color: '#22c55e', brightness: 90 },
      tvb:    { on: true, color: '#ef4444', brightness: 85 },
      rope:   { on: true, color: '#f59e0b', brightness: 80 },
      ylight: { on: true, color: '#ef4444', brightness: 85 },
    },
  },
  halloween: {
    name: 'Halloween',
    devices: {
      hexa:   { on: true, color: '#a855f7', brightness: 75 },
      tvb:    { on: true, color: '#f97316', brightness: 80 },
      rope:   { on: true, color: '#22c55e', brightness: 70 },
      ylight: { on: true, color: '#f97316', brightness: 75 },
    },
  },
  starry: {
    name: 'Starry Sky',
    devices: {
      hexa:   { on: true, color: '#c084fc', brightness: 60 },
      tvb:    { on: true, color: '#1e40af', brightness: 70 },
      rope:   { on: true, color: '#ffffff', brightness: 50 },
      ylight: { on: true, color: '#3b82f6', brightness: 65 },
    },
  },
  bonfire: {
    name: 'Bonfire',
    devices: {
      hexa:   { on: true, color: '#f97316', brightness: 85 },
      tvb:    { on: true, color: '#ef4444', brightness: 80 },
      rope:   { on: true, color: '#eab308', brightness: 75 },
      ylight: { on: true, color: '#ef4444', brightness: 80 },
    },
  },
  aurora: {
    name: 'Aurora',
    devices: {
      hexa:   { on: true, color: '#06d6a0', brightness: 80 },
      tvb:    { on: true, color: '#3b82f6', brightness: 75 },
      rope:   { on: true, color: '#c084fc', brightness: 70 },
      ylight: { on: true, color: '#06d6a0', brightness: 75 },
    },
  },
  sunset: {
    name: 'Sunset Glow',
    devices: {
      hexa:   { on: true, color: '#ec4899', brightness: 80 },
      tvb:    { on: true, color: '#f97316', brightness: 85 },
      rope:   { on: true, color: '#7c3aed', brightness: 70 },
      ylight: { on: true, color: '#f97316', brightness: 80 },
    },
  },
};

export function deviceSummary(dev: Device) {
  return {
    id: dev.id,
    name: dev.name,
    model: dev.model,
    type: dev.type,
    online: dev.online,
    state: { ...dev.state },
  };
}

export function resolveDeviceIds(ids: string[]): string[] {
  if (ids.includes('all')) return Object.keys(DEVICES);
  return ids.filter(id => id in DEVICES);
}

export function getAllDeviceStates(): Record<string, DeviceState> {
  const result: Record<string, DeviceState> = {};
  for (const [id, dev] of Object.entries(DEVICES)) {
    result[id] = { ...dev.state };
  }
  return result;
}

/** Persist current device state to disk and broadcast to SSE clients. */
export function persistDevices() {
  saveState(DEVICES);
  deviceEvents.emit('change', getAllDeviceStates());
}

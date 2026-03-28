/**
 * JSON file-based device state persistence.
 * Reads/writes to data/devices.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Device } from './devices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'devices.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadState(): Record<string, Device> | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(devices: Record<string, Device>) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(devices, null, 2));
}

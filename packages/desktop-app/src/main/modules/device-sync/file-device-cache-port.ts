import fs from 'node:fs/promises';
import path from 'node:path';
import type { MiHomeDeviceSummary } from '../../../shared/mihome/types';
import type { DeviceCachePort } from './ports';

export class FileDeviceCachePort implements DeviceCachePort {
  constructor(private readonly cachePath: string) {}

  async saveDevices(devices: MiHomeDeviceSummary[]): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    const tempPath = `${this.cachePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(devices, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.cachePath);
  }

  async getDevices(): Promise<MiHomeDeviceSummary[]> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf8');
      return JSON.parse(raw) as MiHomeDeviceSummary[];
    } catch {
      return [];
    }
  }
}
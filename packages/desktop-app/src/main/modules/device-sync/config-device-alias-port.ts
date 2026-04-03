import type { DeviceAliasRecord } from '../../../shared/config/types';
import type { MiHomeDeviceSummary } from '../../../shared/mihome/types';
import { SEEDED_DEVICE_ALIAS_CANDIDATES } from '../../../shared/mihome/device-name';
import type { ConfigService } from '../config';
import type { DeviceAliasPort } from './ports';

export class ConfigDeviceAliasPort implements DeviceAliasPort {
  constructor(private readonly configService: ConfigService) {}

  async getAliases(): Promise<Record<string, DeviceAliasRecord>> {
    return this.configService.getByPath<Record<string, DeviceAliasRecord>>('devices.aliases');
  }

  async seedAliases(devices: MiHomeDeviceSummary[]): Promise<Record<string, DeviceAliasRecord>> {
    const currentAliases = await this.getAliases();
    const nextAliases = { ...currentAliases };
    const now = new Date().toISOString();
    let hasChanges = false;

    for (const device of devices) {
      if (nextAliases[device.id]) {
        continue;
      }

      const candidate = SEEDED_DEVICE_ALIAS_CANDIDATES.find(
        (item) =>
          item.deviceId === device.id &&
          item.model === device.model &&
          item.originalName === device.originalName,
      );

      if (!candidate) {
        continue;
      }

      nextAliases[device.id] = {
        alias: candidate.alias,
        applyWhenOriginalName: candidate.originalName,
        source: 'seed',
        note: candidate.note,
        updatedAt: now,
      };
      hasChanges = true;
    }

    if (hasChanges) {
      await this.configService.setByPath('devices.aliases', nextAliases);
    }

    return nextAliases;
  }

  async setAlias(
    deviceId: string,
    alias: string | null,
    originalName: string,
  ): Promise<Record<string, DeviceAliasRecord>> {
    const currentAliases = await this.getAliases();
    const nextAliases = { ...currentAliases };

    if (!alias || alias.trim() === '') {
      delete nextAliases[deviceId];
    } else {
      nextAliases[deviceId] = {
        alias: alias.trim(),
        source: 'manual',
        updatedAt: new Date().toISOString(),
        ...(originalName.trim() ? { applyWhenOriginalName: originalName.trim() } : {}),
      };
    }

    await this.configService.setByPath('devices.aliases', nextAliases);
    return nextAliases;
  }
}

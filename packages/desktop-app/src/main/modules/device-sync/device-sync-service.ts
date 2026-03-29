import { applyDeviceNamePreference } from '../../../shared/mihome/device-name';
import type { MiHomeDeviceSummary } from '../../../shared/mihome/types';
import type { DeviceAliasPort, DeviceCachePort, DeviceCloudSyncPort } from './ports';

export class DeviceSyncService {
  constructor(
    private readonly cloudSyncPort: DeviceCloudSyncPort,
    private readonly cachePort: DeviceCachePort,
    private readonly aliasPort: DeviceAliasPort,
  ) {}

  async syncFromCloud(): Promise<MiHomeDeviceSummary[]> {
    const homes = await this.cloudSyncPort.getHomes();
    const devicesByHome = await Promise.all(
      homes.map(async (home) => this.cloudSyncPort.getDevices(home.id)),
    );

    const devices = devicesByHome.flat();
    const aliases = await this.aliasPort.seedAliases(devices);
    const resolvedDevices = devices.map((device) =>
      applyDeviceNamePreference(device, aliases[device.id]),
    );

    await this.cachePort.saveDevices(resolvedDevices);
    return resolvedDevices;
  }

  async getCachedDevices(): Promise<MiHomeDeviceSummary[]> {
    const cachedDevices = await this.cachePort.getDevices();
    const aliases = await this.aliasPort.seedAliases(cachedDevices);

    return cachedDevices.map((device) => applyDeviceNamePreference(device, aliases[device.id]));
  }

  async setAlias(deviceId: string, alias: string | null): Promise<MiHomeDeviceSummary[]> {
    const cachedDevices = await this.cachePort.getDevices();
    const targetDevice = cachedDevices.find((device) => device.id === deviceId);

    if (!targetDevice) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const aliases = await this.aliasPort.setAlias(
      deviceId,
      alias,
      targetDevice.originalName || targetDevice.name,
    );
    const resolvedDevices = cachedDevices.map((device) =>
      applyDeviceNamePreference(device, aliases[device.id]),
    );

    await this.cachePort.saveDevices(resolvedDevices);
    return resolvedDevices;
  }
}

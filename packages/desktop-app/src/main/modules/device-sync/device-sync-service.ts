import { applyDeviceNamePreference } from '../../../shared/mihome/device-name';
import type { DeviceAliasRecord } from '../../../shared/config/types';
import type { MiHomeDeviceSummary } from '../../../shared/mihome/types';
import type { DeviceAliasPort, DeviceCachePort, DeviceCloudSyncPort, DeviceFavoritePort } from './ports';

export class DeviceSyncService {
  constructor(
    private readonly cloudSyncPort: DeviceCloudSyncPort,
    private readonly cachePort: DeviceCachePort,
    private readonly aliasPort: DeviceAliasPort,
    private readonly favoritePort: DeviceFavoritePort,
  ) {}

  async syncFromCloud(): Promise<MiHomeDeviceSummary[]> {
    const devices = await this.cloudSyncPort.getDevices();
    const resolvedDevices = await this.resolveDevices(devices);

    await this.cachePort.saveDevices(resolvedDevices);
    return resolvedDevices;
  }

  async getCachedDevices(): Promise<MiHomeDeviceSummary[]> {
    const cachedDevices = await this.cachePort.getDevices();
    return this.resolveDevices(cachedDevices);
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
    const favoriteDeviceIds = await this.favoritePort.getFavoriteDeviceIds();
    const resolvedDevices = this.applyPreferences(cachedDevices, aliases, favoriteDeviceIds);

    await this.cachePort.saveDevices(resolvedDevices);
    return resolvedDevices;
  }

  async setFavorite(deviceId: string, isFavorite: boolean): Promise<MiHomeDeviceSummary[]> {
    const cachedDevices = await this.cachePort.getDevices();
    const targetDevice = cachedDevices.find((device) => device.id === deviceId);

    if (!targetDevice) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const [aliases, favoriteDeviceIds] = await Promise.all([
      this.aliasPort.seedAliases(cachedDevices),
      this.favoritePort.setFavorite(deviceId, isFavorite),
    ]);
    const resolvedDevices = this.applyPreferences(cachedDevices, aliases, favoriteDeviceIds);

    await this.cachePort.saveDevices(resolvedDevices);
    return resolvedDevices;
  }

  private async resolveDevices(devices: MiHomeDeviceSummary[]): Promise<MiHomeDeviceSummary[]> {
    const [aliases, favoriteDeviceIds] = await Promise.all([
      this.aliasPort.seedAliases(devices),
      this.favoritePort.getFavoriteDeviceIds(),
    ]);

    return this.applyPreferences(devices, aliases, favoriteDeviceIds);
  }

  private applyPreferences(
    devices: MiHomeDeviceSummary[],
    aliases: Record<string, DeviceAliasRecord>,
    favoriteDeviceIds: string[],
  ): MiHomeDeviceSummary[] {
    const favoriteDeviceIdSet = new Set(favoriteDeviceIds);

    return devices.map((device) => ({
      ...applyDeviceNamePreference(device, aliases[device.id]),
      isFavorite: favoriteDeviceIdSet.has(device.id),
    }));
  }
}

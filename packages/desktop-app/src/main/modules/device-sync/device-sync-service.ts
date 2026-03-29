import type { MiHomeDeviceSummary } from '../../../shared/mihome/types';
import type { DeviceCachePort, DeviceCloudSyncPort } from './ports';

export class DeviceSyncService {
  constructor(
    private readonly cloudSyncPort: DeviceCloudSyncPort,
    private readonly cachePort: DeviceCachePort,
  ) {}

  async syncFromCloud(): Promise<MiHomeDeviceSummary[]> {
    const homes = await this.cloudSyncPort.getHomes();
    const devicesByHome = await Promise.all(
      homes.map(async (home) => this.cloudSyncPort.getDevices(home.id)),
    );

    const devices = devicesByHome.flat();
    await this.cachePort.saveDevices(devices);
    return devices;
  }

  async getCachedDevices(): Promise<MiHomeDeviceSummary[]> {
    return this.cachePort.getDevices();
  }
}
import type { DeviceAliasRecord } from '../../../shared/config/types';
import type { MiHomeDeviceSummary, MiHomeHomeSummary, MiHomeRoomSummary } from '../../../shared/mihome/types';

export interface DeviceCloudSyncPort {
  getHomes(): Promise<MiHomeHomeSummary[]>;
  getRooms(homeId: string): Promise<MiHomeRoomSummary[]>;
  getDevices(homeId: string): Promise<MiHomeDeviceSummary[]>;
}

export interface DeviceCachePort {
  saveDevices(devices: MiHomeDeviceSummary[]): Promise<void>;
  getDevices(): Promise<MiHomeDeviceSummary[]>;
}

export interface DeviceAliasPort {
  getAliases(): Promise<Record<string, DeviceAliasRecord>>;
  seedAliases(devices: MiHomeDeviceSummary[]): Promise<Record<string, DeviceAliasRecord>>;
  setAlias(deviceId: string, alias: string | null, originalName: string): Promise<Record<string, DeviceAliasRecord>>;
}

export interface DeviceFavoritePort {
  getFavoriteDeviceIds(): Promise<string[]>;
  setFavorite(deviceId: string, isFavorite: boolean): Promise<string[]>;
}

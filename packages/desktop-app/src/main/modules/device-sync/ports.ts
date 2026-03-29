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
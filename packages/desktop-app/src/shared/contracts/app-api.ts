import type { AppConfig, AppConfigPatch } from '../config/types';
import type {
  DeviceCommandRequest,
  DeviceCommandResult,
  DeviceStatusSnapshot,
  MiHomeDeviceSummary,
  MiHomeQrLoginTicket,
  MiHomeSessionSnapshot,
} from '../mihome/types';

export interface AppApi {
  getVersion(): Promise<string>;
  quit(): Promise<void>;
}

export interface WindowApi {
  moveTo(x: number, y: number): Promise<void>;
  toggleAlwaysOnTop(): Promise<boolean>;
  resetPosition(): Promise<void>;
}

export interface AuthApi {
  startQrLogin(region: 'cn' | 'de' | 'us'): Promise<MiHomeQrLoginTicket>;
  pollQrLogin(ticketId: string): Promise<MiHomeSessionSnapshot>;
  getSession(): Promise<MiHomeSessionSnapshot>;
  logout(): Promise<MiHomeSessionSnapshot>;
}

export interface DeviceApi {
  getAll(): Promise<MiHomeDeviceSummary[]>;
  syncFromCloud(force?: boolean): Promise<MiHomeDeviceSummary[]>;
  getStatus(deviceId: string): Promise<DeviceStatusSnapshot>;
  control(command: DeviceCommandRequest): Promise<DeviceCommandResult>;
  setAlias(deviceId: string, alias: string | null): Promise<MiHomeDeviceSummary[]>;
}

export interface ConfigApi {
  load(): Promise<AppConfig>;
  save(patch?: AppConfigPatch): Promise<AppConfig>;
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T): Promise<AppConfig>;
}

export interface MijiaDesktopApi {
  app: AppApi;
  window: WindowApi;
  auth: AuthApi;
  device: DeviceApi;
  config: ConfigApi;
}

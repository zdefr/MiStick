import type { AppConfig, AppConfigPatch } from '../config/types';

export interface AppApi {
  getVersion(): Promise<string>;
}

export interface WindowApi {
  moveTo(x: number, y: number): Promise<void>;
  toggleAlwaysOnTop(): Promise<boolean>;
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
  config: ConfigApi;
}
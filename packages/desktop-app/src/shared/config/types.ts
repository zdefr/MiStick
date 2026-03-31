export type MiHomeRegion = 'cn' | 'de' | 'us';
export type AppearanceTheme = 'light' | 'dark' | 'system';
export type AppLanguage = 'zh-CN' | 'en';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DeviceAliasSource = 'seed' | 'manual';

export interface DeviceAliasRecord {
  alias: string;
  applyWhenOriginalName?: string;
  source: DeviceAliasSource;
  note?: string;
  updatedAt: string;
}

export interface AppConfig {
  version: string;
  userId: string;
  miHome: {
    provider: 'mijia-api';
    accountId?: string;
    authStoragePath: string;
    region: MiHomeRegion;
    lastLoginAt?: string;
    token?: string;
  };
  services: {
    mihomeBridge: {
      baseUrl: string;
      timeoutMs: number;
    };
    localControl: {
      enabled: boolean;
      baseUrl: string;
      timeoutMs: number;
    };
  };
  window: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    alwaysOnTop: boolean;
    opacity: number;
    backgroundOpacity: number;
    interactionOpacity: number;
    skipTaskbar: boolean;
  };
  appearance: {
    theme: AppearanceTheme;
    fontSize: number;
    language: AppLanguage;
  };
  devices: {
    autoRefresh: boolean;
    refreshInterval: number;
    lastSyncAt?: string;
    aliases: Record<string, DeviceAliasRecord>;
  };
  logging: {
    level: LogLevel;
    maxFiles: number;
    maxSize: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type AppConfigPatch = Partial<AppConfig>;

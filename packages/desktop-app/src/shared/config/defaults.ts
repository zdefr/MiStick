import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from './types';

export function createDefaultAppConfig(userDataDir: string): AppConfig {
  const now = new Date().toISOString();

  return {
    version: '1.0.0',
    userId: randomUUID(),
    miHome: {
      provider: 'mijia-api',
      authStoragePath: path.join(userDataDir, 'mihome-auth.json'),
      region: 'cn',
    },
    services: {
      mihomeBridge: {
        baseUrl: 'http://127.0.0.1:8790',
        timeoutMs: 10000,
      },
      localControl: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:8791',
        timeoutMs: 5000,
      },
    },
    window: {
      width: 400,
      height: 600,
      alwaysOnTop: true,
      opacity: 1,
      backgroundOpacity: 0.72,
      interactionOpacity: 0.88,
      skipTaskbar: true,
    },
    appearance: {
      theme: 'system',
      fontSize: 14,
      language: 'zh-CN',
    },
    devices: {
      autoRefresh: true,
      refreshInterval: 300,
      aliases: {},
    },
    logging: {
      level: 'info',
      maxFiles: 7,
      maxSize: '10m',
    },
    createdAt: now,
    updatedAt: now,
  };
}

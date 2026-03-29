import fs from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { registerIpcHandlers } from './ipc/register-ipc-handlers';
import { ConfigService } from './modules/config';
import {
  CachedDeviceCapabilityPort,
  DeviceControlService,
  HttpCloudControlPort,
  NoopLocalControlPort,
} from './modules/device-control';
import { DeviceSyncService, FileDeviceCachePort, HttpDeviceCloudSyncPort } from './modules/device-sync';
import { ConfigSessionPort, HttpMiHomeBridgeAuthPort, MiHomeSessionService } from './modules/mihome-session';
import { createMainWindow } from './window/create-main-window';
import { bindWindowStatePersistence } from './window/window-state';

const appName = 'mijia-sticky';
const isDev = !app.isPackaged;
const rendererDevServerUrl = 'http://127.0.0.1:5173';

app.setName(appName);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.mijia.sticky');
}

function getLegacyUserDataDir(): string {
  return path.join(app.getPath('appData'), 'Electron');
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await pathExists(sourcePath)) || (await pathExists(targetPath))) {
    return;
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function copyDirectoryIfMissing(sourceDir: string, targetDir: string): Promise<void> {
  if (!(await pathExists(sourceDir)) || (await pathExists(targetDir))) {
    return;
  }

  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryIfMissing(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function migrateLegacyUserData(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const legacyUserDataDir = getLegacyUserDataDir();

  if (userDataDir === legacyUserDataDir || !(await pathExists(legacyUserDataDir))) {
    return;
  }

  await copyIfMissing(
    path.join(legacyUserDataDir, 'config.json'),
    path.join(userDataDir, 'config.json'),
  );
  await copyIfMissing(
    path.join(legacyUserDataDir, 'legacy-token.key'),
    path.join(userDataDir, 'legacy-token.key'),
  );
  await copyIfMissing(
    path.join(legacyUserDataDir, 'mihome-auth.json'),
    path.join(userDataDir, 'mihome-auth.json'),
  );
  await copyDirectoryIfMissing(
    path.join(legacyUserDataDir, 'backups'),
    path.join(userDataDir, 'backups'),
  );
}

async function bootstrap(): Promise<void> {
  await migrateLegacyUserData();

  const userDataDir = app.getPath('userData');
  const configService = new ConfigService(userDataDir);
  const config = await configService.load();
  const bridgeClientOptions = {
    baseUrl: config.services.mihomeBridge.baseUrl,
    timeoutMs: config.services.mihomeBridge.timeoutMs,
  };
  const mihomeSessionService = new MiHomeSessionService(
    new HttpMiHomeBridgeAuthPort(bridgeClientOptions),
    new ConfigSessionPort(configService),
  );
  const deviceCachePort = new FileDeviceCachePort(path.join(userDataDir, 'cache', 'devices.json'));
  const deviceSyncService = new DeviceSyncService(
    new HttpDeviceCloudSyncPort(bridgeClientOptions),
    deviceCachePort,
  );
  const deviceControlService = new DeviceControlService(
    new CachedDeviceCapabilityPort(deviceCachePort),
    new HttpCloudControlPort(bridgeClientOptions),
    new NoopLocalControlPort(),
  );

  registerIpcHandlers({ configService, deviceControlService, mihomeSessionService, deviceSyncService });
  const mainWindow = createMainWindow(config);
  bindWindowStatePersistence(mainWindow, configService, config);

  if (isDev) {
    await mainWindow.loadURL(rendererDevServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '../../dist/renderer/index.html');
    await mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    console.error('Failed to bootstrap app', error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'mijia-sticky',
      message: '应用启动失败',
      detail: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    app.quit();
    return;
  }

  app.on('activate', async () => {
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length === 0) {
      try {
        await bootstrap();
      } catch (error) {
        console.error('Failed to reactivate app', error);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

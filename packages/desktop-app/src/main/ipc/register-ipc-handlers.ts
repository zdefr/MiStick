import { app, BrowserWindow, ipcMain } from 'electron';
import type { ConfigService } from '../modules/config';
import type { DeviceControlService } from '../modules/device-control';
import type { DeviceSyncService } from '../modules/device-sync';
import type { MiHomeSessionService } from '../modules/mihome-session';
import { applyWindowConfig } from '../window/apply-window-config';
import { resolveInitialWindowBounds, resolveSnappedWindowPosition } from '../window/window-state';

interface IpcServices {
  configService: ConfigService;
  deviceControlService: DeviceControlService;
  mihomeSessionService: MiHomeSessionService;
  deviceSyncService: DeviceSyncService;
}

function replaceHandler(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}

export function registerIpcHandlers({
  configService,
  deviceControlService,
  mihomeSessionService,
  deviceSyncService,
}: IpcServices): void {
  replaceHandler('app:getVersion', () => app.getVersion());
  replaceHandler('app:quit', async () => {
    setTimeout(() => {
      app.quit();
    }, 0);
  });

  replaceHandler('window:moveTo', async (event, { x, y }) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('window:moveTo requires finite x and y');
    }

    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      throw new Error('window:moveTo target window not found');
    }

    const snappedPosition = resolveSnappedWindowPosition(targetWindow, {
      x: Math.round(x),
      y: Math.round(y),
    });
    targetWindow.setPosition(snappedPosition.x, snappedPosition.y);
  });

  replaceHandler('window:toggleAlwaysOnTop', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      throw new Error('window:toggleAlwaysOnTop target window not found');
    }

    const nextAlwaysOnTop = !targetWindow.isAlwaysOnTop();
    targetWindow.setAlwaysOnTop(nextAlwaysOnTop);
    await configService.setByPath('window.alwaysOnTop', nextAlwaysOnTop);
    return nextAlwaysOnTop;
  });

  replaceHandler('window:resetPosition', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      throw new Error('window:resetPosition target window not found');
    }

    const currentConfig = await configService.load();
    const resetBounds = resolveInitialWindowBounds({
      ...currentConfig,
      window: {
        ...(() => {
          const { x: _x, y: _y, ...windowConfig } = currentConfig.window;
          return windowConfig;
        })(),
      },
    });

    targetWindow.setPosition(resetBounds.x, resetBounds.y);
    await configService.save({
      window: {
        ...currentConfig.window,
        x: resetBounds.x,
        y: resetBounds.y,
      },
    });
  });

  replaceHandler('auth:startQrLogin', async (_event, { region }) => {
    if (!['cn', 'de', 'us'].includes(region)) {
      throw new Error('auth:startQrLogin requires a supported region');
    }

    return mihomeSessionService.startQrLogin(region);
  });

  replaceHandler('auth:pollQrLogin', async (_event, { ticketId }) => {
    if (typeof ticketId !== 'string' || ticketId.trim() === '') {
      throw new Error('auth:pollQrLogin requires a non-empty ticketId');
    }

    return mihomeSessionService.pollQrLogin(ticketId);
  });

  replaceHandler('auth:getSession', async () => mihomeSessionService.getSession());
  replaceHandler('auth:logout', async () => mihomeSessionService.logout());

  replaceHandler('device:getAll', async () => deviceSyncService.getCachedDevices());
  replaceHandler('device:syncFromCloud', async () => deviceSyncService.syncFromCloud());
  replaceHandler('device:setAlias', async (_event, { deviceId, alias }) => {
    if (typeof deviceId !== 'string' || deviceId.trim() === '') {
      throw new Error('device:setAlias requires a non-empty deviceId');
    }

    if (alias !== null && typeof alias !== 'string') {
      throw new Error('device:setAlias requires alias to be a string or null');
    }

    return deviceSyncService.setAlias(deviceId, alias);
  });
  replaceHandler('device:getStatus', async (_event, { deviceId }) => {
    if (typeof deviceId !== 'string' || deviceId.trim() === '') {
      throw new Error('device:getStatus requires a non-empty deviceId');
    }

    return deviceControlService.getStatus(deviceId);
  });
  replaceHandler('device:control', async (_event, command) => {
    if (!command || typeof command.deviceId !== 'string' || command.deviceId.trim() === '') {
      throw new Error('device:control requires a non-empty deviceId');
    }

    if (
      !['toggle', 'turnOn', 'turnOff', 'refresh', 'setModeAuto', 'setModeSleep', 'setModeFavorite'].includes(
        command.action,
      )
    ) {
      throw new Error('device:control requires a supported action');
    }

    if (command.action === 'refresh') {
      const updatedStatus = await deviceControlService.getStatus(command.deviceId);
      return {
        deviceId: command.deviceId,
        success: true,
        route: updatedStatus.route,
        updatedStatus,
      };
    }

    return deviceControlService.execute(command);
  });

  replaceHandler('config:load', async () => configService.load());

  replaceHandler('config:save', async (event, patch) => {
    const savedConfig = await configService.save(patch);
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow) {
      applyWindowConfig(targetWindow, savedConfig);
    }
    return savedConfig;
  });

  replaceHandler('config:get', async (_event, { key }) => {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('config:get requires a non-empty key');
    }

    return configService.getByPath(key);
  });

  replaceHandler('config:set', async (event, { key, value }) => {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('config:set requires a non-empty key');
    }

    const savedConfig = await configService.setByPath(key, value);
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow) {
      applyWindowConfig(targetWindow, savedConfig);
    }
    return savedConfig;
  });
}

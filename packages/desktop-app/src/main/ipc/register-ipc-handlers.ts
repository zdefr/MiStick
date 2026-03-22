import { app, BrowserWindow, ipcMain } from 'electron';
import type { ConfigService } from '../modules/config';
import { resolveSnappedWindowPosition } from '../window/window-state';

interface IpcServices {
  configService: ConfigService;
}

function replaceHandler(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}

export function registerIpcHandlers({ configService }: IpcServices): void {
  replaceHandler('app:getVersion', () => app.getVersion());

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

  replaceHandler('config:load', async () => configService.load());

  replaceHandler('config:save', async (_event, patch) => configService.save(patch));

  replaceHandler('config:get', async (_event, { key }) => {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('config:get requires a non-empty key');
    }

    return configService.getByPath(key);
  });

  replaceHandler('config:set', async (_event, { key, value }) => {
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('config:set requires a non-empty key');
    }

    return configService.setByPath(key, value);
  });
}
import path from 'node:path';
import { BrowserWindow } from 'electron';
import type { AppConfig } from '../../shared/config/types';
import { resolveInitialWindowBounds } from './window-state';

export function createMainWindow(config: AppConfig): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/index.js');
  const bounds = resolveInitialWindowBounds(config);

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    alwaysOnTop: config.window.alwaysOnTop,
    skipTaskbar: config.window.skipTaskbar,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.setOpacity(config.window.opacity);

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}
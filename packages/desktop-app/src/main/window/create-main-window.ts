import path from 'node:path';
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import type { AppConfig } from '../../shared/config/types';
import { createAppIconImage } from '../app-icon';
import { applyWindowConfig } from './apply-window-config';
import { resolveInitialWindowBounds } from './window-state';

export function createMainWindow(config: AppConfig): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/index.js');
  const bounds = resolveInitialWindowBounds(config);
  const appIcon = createAppIconImage();

  const windowOptions: BrowserWindowConstructorOptions = {
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
  };

  if (!appIcon.isEmpty()) {
    windowOptions.icon = appIcon;
  }

  const window = new BrowserWindow(windowOptions);

  applyWindowConfig(window, config);

  const showWindow = (): void => {
    if (window.isDestroyed() || window.isVisible()) {
      return;
    }

    window.show();
    window.focus();
  };

  const fallbackTimer = setTimeout(() => {
    console.warn('Main window did not emit ready-to-show in time, forcing visible state.');
    showWindow();
  }, 5_000);

  window.once('show', () => {
    clearTimeout(fallbackTimer);
  });

  window.once('ready-to-show', showWindow);
  window.webContents.once('did-finish-load', showWindow);
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }

    clearTimeout(fallbackTimer);
    console.error(
      `Main window failed to load: code=${errorCode}, description=${errorDescription}, url=${validatedURL}`,
    );
    showWindow();
  });

  return window;
}

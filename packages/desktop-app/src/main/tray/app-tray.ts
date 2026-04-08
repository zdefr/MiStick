import { Menu, Tray, app } from 'electron';
import { createTrayIconImage } from '../app-icon';

let appTray: Tray | undefined;

export function ensureAppTray(): Tray | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }

  if (appTray && !appTray.isDestroyed()) {
    return appTray;
  }

  const trayIcon = createTrayIconImage();
  if (trayIcon.isEmpty()) {
    console.warn('Tray icon could not be created, tray setup skipped.');
    return undefined;
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip('mijia-sticky');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '\u9000\u51fa\u5e94\u7528',
        click: () => {
          app.quit();
        },
      },
    ]),
  );

  appTray = tray;
  return tray;
}

export function destroyAppTray(): void {
  if (!appTray) {
    return;
  }

  if (!appTray.isDestroyed()) {
    appTray.destroy();
  }

  appTray = undefined;
}

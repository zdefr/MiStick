import { BrowserWindow } from 'electron';
import type { AppConfig } from '../../shared/config/types';
import { resolveSnappedWindowPosition } from './window-state';

export function applyWindowConfig(window: BrowserWindow, config: AppConfig): void {
  if (window.isDestroyed()) {
    return;
  }

  const width = Math.round(config.window.width);
  const height = Math.round(config.window.height);
  const [currentWidth, currentHeight] = window.getSize();
  if (currentWidth !== width || currentHeight !== height) {
    window.setSize(width, height);
  }

  const nextPosition = resolveSnappedWindowPosition(window, {
    x: Math.round(config.window.x ?? window.getBounds().x),
    y: Math.round(config.window.y ?? window.getBounds().y),
  });
  const [currentX, currentY] = window.getPosition();
  if (currentX !== nextPosition.x || currentY !== nextPosition.y) {
    window.setPosition(nextPosition.x, nextPosition.y);
  }

  if (window.isAlwaysOnTop() !== config.window.alwaysOnTop) {
    window.setAlwaysOnTop(config.window.alwaysOnTop);
  }

  if (window.getOpacity() !== 1) {
    window.setOpacity(1);
  }

  window.setSkipTaskbar(config.window.skipTaskbar);
}

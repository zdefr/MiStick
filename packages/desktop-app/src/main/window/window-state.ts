import { BrowserWindow, screen } from 'electron';
import type { AppConfig, AppConfigPatch } from '../../shared/config/types';

const WINDOW_MARGIN = 24;
const WINDOW_SNAP_THRESHOLD = 20;
const WINDOW_STATE_SAVE_DELAY_MS = 600;

interface WindowStateConfigPort {
  save(patch: AppConfigPatch): Promise<AppConfig>;
}

interface ResolvedWindowBounds {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface WindowPosition {
  x: number;
  y: number;
}

export function resolveInitialWindowBounds(config: AppConfig): ResolvedWindowBounds {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(config.window.width, workArea.width);
  const height = Math.min(config.window.height, workArea.height);
  const defaultX = workArea.x + workArea.width - width - WINDOW_MARGIN;
  const defaultY = workArea.y + workArea.height - height - WINDOW_MARGIN;
  const x = clamp(
    config.window.x ?? defaultX,
    workArea.x,
    workArea.x + Math.max(0, workArea.width - width),
  );
  const y = clamp(
    config.window.y ?? defaultY,
    workArea.y,
    workArea.y + Math.max(0, workArea.height - height),
  );

  return { width, height, x, y };
}

export function resolveSnappedWindowPosition(
  window: BrowserWindow,
  nextPosition: WindowPosition,
): WindowPosition {
  const bounds = window.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: nextPosition.x + Math.round(bounds.width / 2),
    y: nextPosition.y + Math.round(bounds.height / 2),
  });
  const workArea = display.workArea;
  const minX = workArea.x;
  const maxX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const minY = workArea.y;
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);

  let x = clamp(nextPosition.x, minX, maxX);
  let y = clamp(nextPosition.y, minY, maxY);

  if (Math.abs(x - minX) <= WINDOW_SNAP_THRESHOLD) {
    x = minX;
  } else if (Math.abs(x - maxX) <= WINDOW_SNAP_THRESHOLD) {
    x = maxX;
  }

  if (Math.abs(y - minY) <= WINDOW_SNAP_THRESHOLD) {
    y = minY;
  } else if (Math.abs(y - maxY) <= WINDOW_SNAP_THRESHOLD) {
    y = maxY;
  }

  return { x, y };
}

export function bindWindowStatePersistence(
  window: BrowserWindow,
  configPort: WindowStateConfigPort,
  currentConfig: AppConfig,
): void {
  let saveTimer: NodeJS.Timeout | null = null;

  const flushWindowState = async (): Promise<void> => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    if (window.isDestroyed()) {
      return;
    }

    const bounds = window.getBounds();
    await configPort.save({
      window: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        alwaysOnTop: window.isAlwaysOnTop(),
        opacity: window.getOpacity(),
        backgroundOpacity: currentConfig.window.backgroundOpacity,
        interactionOpacity: currentConfig.window.interactionOpacity,
        skipTaskbar: currentConfig.window.skipTaskbar,
      },
    });
  };

  const scheduleWindowStateSave = (): void => {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      void flushWindowState().catch((error) => {
        console.error('Failed to persist window state', error);
      });
    }, WINDOW_STATE_SAVE_DELAY_MS);
  };

  window.on('move', scheduleWindowStateSave);
  window.on('resize', scheduleWindowStateSave);
  window.on('close', () => {
    void flushWindowState().catch((error) => {
      console.error('Failed to persist window state before close', error);
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

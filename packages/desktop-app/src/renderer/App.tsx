import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { AppConfig } from '../shared/config/types';

const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_TICK_MS = 100;
const HINT_RESET_DELAY_MS = 1200;
const DEFAULT_DRAG_HINT = '\u957f\u6309\u9876\u90e8\u624b\u67c4\u53ef\u62d6\u52a8\u7a97\u53e3';
const DRAG_HOLDING_HINT = '\u4fdd\u6301\u6309\u4f4f\uff0c\u5706\u73af\u586b\u6ee1\u540e\u5f00\u59cb\u62d6\u52a8';
const DRAG_ACTIVE_HINT = '\u62d6\u52a8\u4e2d\uff0c\u677e\u5f00\u9f20\u6807\u7ed3\u675f';
const PINNED_ON_HINT = '\u5df2\u5f00\u542f\u7f6e\u9876';
const PINNED_OFF_HINT = '\u5df2\u53d6\u6d88\u7f6e\u9876';
const HERO_TITLE = '\u5de5\u7a0b\u9aa8\u67b6\u5df2\u542f\u52a8';
const HERO_DESCRIPTION =
  '\u5f53\u524d\u9636\u6bb5\u5df2\u843d\u5730 Electron \u58f3\u548c M04 \u914d\u7f6e\u7ba1\u7406\u6a21\u5757\uff0c\u540e\u7eed\u4f1a\u5728\u8fd9\u4e2a\u57fa\u7840\u4e0a\u7ee7\u7eed\u63a5\u5165 M01 \u7684\u626b\u7801\u767b\u5f55\u4e0e\u4e91\u7aef\u540c\u6b65\u3002';

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ProgressStyle extends CSSProperties {
  '--drag-progress': string;
}

export function App() {
  const [version, setVersion] = useState<string>('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<string>(DEFAULT_DRAG_HINT);
  const [dragProgress, setDragProgress] = useState<number>(0);
  const [isDragReady, setIsDragReady] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(true);
  const dragStateRef = useRef<DragState | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressCountdownRef = useRef<number | null>(null);
  const longPressDeadlineRef = useRef<number | null>(null);
  const hintResetTimerRef = useRef<number | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void hydrate();

    return () => {
      clearLongPressState();
      clearHintResetTimer();
      if (moveFrameRef.current !== null) {
        window.cancelAnimationFrame(moveFrameRef.current);
      }
    };
  }, []);

  async function hydrate() {
    try {
      const [appVersion, loadedConfig] = await Promise.all([
        window.mijia.app.getVersion(),
        window.mijia.config.load(),
      ]);

      setVersion(appVersion);
      setConfig(loadedConfig);
      setIsPinned(loadedConfig.window.alwaysOnTop);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    }
  }

  function handleDragPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.screenX - window.screenX,
      offsetY: event.screenY - window.screenY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    startLongPressFeedback();
    longPressTimerRef.current = window.setTimeout(() => {
      setIsDragReady(true);
      setDragProgress(1);
      setDragHint(DRAG_ACTIVE_HINT);
      stopLongPressCountdown();
      longPressDeadlineRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  }

  function handleDragPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !isDragReady) {
      return;
    }

    const nextX = event.screenX - dragState.offsetX;
    const nextY = event.screenY - dragState.offsetY;
    queueWindowMove(nextX, nextY);
  }

  function handleDragPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDragState();
  }

  function handleDragPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      dragStateRef.current?.pointerId === event.pointerId &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDragState();
  }

  async function handleDragHandleDoubleClick() {
    clearLongPressState();
    clearHintResetTimer();
    dragStateRef.current = null;
    setIsDragReady(false);
    setDragProgress(0);

    try {
      const nextPinned = await window.mijia.window.toggleAlwaysOnTop();
      setIsPinned(nextPinned);
      setConfig((currentConfig) => {
        if (!currentConfig) {
          return currentConfig;
        }

        return {
          ...currentConfig,
          window: {
            ...currentConfig.window,
            alwaysOnTop: nextPinned,
          },
        };
      });
      setDragHint(nextPinned ? PINNED_ON_HINT : PINNED_OFF_HINT);
      hintResetTimerRef.current = window.setTimeout(() => {
        setDragHint(DEFAULT_DRAG_HINT);
        hintResetTimerRef.current = null;
      }, HINT_RESET_DELAY_MS);
    } catch (toggleError) {
      console.error('Failed to toggle always on top', toggleError);
      setDragHint(DEFAULT_DRAG_HINT);
    }
  }

  function queueWindowMove(x: number, y: number) {
    pendingMoveRef.current = { x, y };

    if (moveFrameRef.current !== null) {
      return;
    }

    moveFrameRef.current = window.requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const pendingMove = pendingMoveRef.current;
      pendingMoveRef.current = null;

      if (!pendingMove) {
        return;
      }

      void window.mijia.window.moveTo(pendingMove.x, pendingMove.y).catch((moveError) => {
        console.error('Failed to move window', moveError);
      });
    });
  }

  function resetDragState() {
    clearLongPressState();
    dragStateRef.current = null;
    setIsDragReady(false);
    setDragProgress(0);
    setDragHint(DEFAULT_DRAG_HINT);
  }

  function startLongPressFeedback() {
    clearLongPressState();
    clearHintResetTimer();
    longPressDeadlineRef.current = Date.now() + LONG_PRESS_DELAY_MS;
    setDragProgress(0);
    setDragHint(DRAG_HOLDING_HINT);
    longPressCountdownRef.current = window.setInterval(() => {
      const remainingMs = getRemainingLongPressMs();
      updateLongPressProgress(remainingMs);
    }, LONG_PRESS_TICK_MS);
  }

  function getRemainingLongPressMs(): number {
    if (longPressDeadlineRef.current === null) {
      return LONG_PRESS_DELAY_MS;
    }

    return Math.max(0, longPressDeadlineRef.current - Date.now());
  }

  function updateLongPressProgress(remainingMs: number) {
    const progress = 1 - remainingMs / LONG_PRESS_DELAY_MS;
    setDragProgress(Math.max(0, Math.min(progress, 1)));
  }

  function clearLongPressState() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressDeadlineRef.current = null;
    stopLongPressCountdown();
  }

  function stopLongPressCountdown() {
    if (longPressCountdownRef.current !== null) {
      window.clearInterval(longPressCountdownRef.current);
      longPressCountdownRef.current = null;
    }
  }

  function clearHintResetTimer() {
    if (hintResetTimerRef.current !== null) {
      window.clearTimeout(hintResetTimerRef.current);
      hintResetTimerRef.current = null;
    }
  }

  const dragProgressStyle: ProgressStyle = {
    '--drag-progress': `${dragProgress}`,
  };

  return (
    <main className="app-shell">
      <div
        className={`drag-handle${isDragReady ? ' drag-handle--active' : ''}${isPinned ? ' drag-handle--pinned' : ''}`}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerCancel}
        onDoubleClick={() => {
          void handleDragHandleDoubleClick();
        }}
      >
        <span className="drag-handle__progress" style={dragProgressStyle}>
          <span className="drag-handle__dot" />
        </span>
        <span>{dragHint}</span>
      </div>

      <section className="card">
        <p className="eyebrow">Mijia Desktop Sticky</p>
        <h1>{HERO_TITLE}</h1>
        <p className="description">{HERO_DESCRIPTION}</p>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>App Info</h2>
          <dl>
            <div>
              <dt>Version</dt>
              <dd>{version || 'loading...'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{error ? 'error' : 'ready'}</dd>
            </div>
            <div>
              <dt>Always On Top</dt>
              <dd>{isPinned ? 'on' : 'off'}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Config Snapshot</h2>
          {config ? (
            <pre>{JSON.stringify(config, null, 2)}</pre>
          ) : (
            <p>{error ?? 'loading config...'}</p>
          )}
        </article>
      </section>
    </main>
  );
}
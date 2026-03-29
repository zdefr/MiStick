import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { AppConfig } from '../shared/config/types';
import type {
  DeviceControlAction,
  DeviceStatusSnapshot,
  LoginStatus,
  MiHomeDeviceSummary,
  MiHomeQrLoginTicket,
  MiHomeSessionSnapshot,
} from '../shared/mihome/types';

const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_TICK_MS = 100;
const HINT_RESET_DELAY_MS = 1200;
const LOGIN_POLL_INTERVAL_MS = 2000;

const DEFAULT_DRAG_HINT = '长按顶部手柄可拖动窗口';
const DRAG_HOLDING_HINT = '保持按住，圆环填满后开始拖动';
const DRAG_ACTIVE_HINT = '拖动中，松开鼠标结束';
const PINNED_ON_HINT = '已开启置顶';
const PINNED_OFF_HINT = '已取消置顶';

const STATUS_LABELS: Record<LoginStatus, string> = {
  idle: '未登录',
  pending: '等待扫码',
  success: '已连接',
  expired: '已过期',
  error: '出错',
};

const STATUS_TONES: Record<LoginStatus, string> = {
  idle: 'neutral',
  pending: 'warning',
  success: 'success',
  expired: 'danger',
  error: 'danger',
};

const DEVICE_ACTION_LABELS: Record<'refresh' | 'turnOn' | 'turnOff', string> = {
  refresh: '刷新状态',
  turnOn: '开启中...',
  turnOff: '关闭中...',
};

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ProgressStyle extends CSSProperties {
  '--drag-progress': string;
}

function resolveRegion(input?: string): 'cn' | 'de' | 'us' {
  if (input === 'de' || input === 'us') {
    return input;
  }

  return 'cn';
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatDateTime(input?: string): string {
  if (!input) {
    return '--';
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return input;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function sortDevices(devices: MiHomeDeviceSummary[]): MiHomeDeviceSummary[] {
  return [...devices].sort((left, right) => {
    if (left.isOnline !== right.isOnline) {
      return left.isOnline ? -1 : 1;
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function canControlDevice(device: MiHomeDeviceSummary): boolean {
  return device.capability.supportsCloudControl || device.capability.supportsLocalControl;
}

export function App() {
  const [version, setVersion] = useState<string>('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<string>(DEFAULT_DRAG_HINT);
  const [dragProgress, setDragProgress] = useState<number>(0);
  const [isDragReady, setIsDragReady] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(true);
  const [session, setSession] = useState<MiHomeSessionSnapshot | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MiHomeDeviceSummary[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [qrTicket, setQrTicket] = useState<MiHomeQrLoginTicket | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isStartingLogin, setIsStartingLogin] = useState<boolean>(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState<boolean>(false);
  const [isSyncingDevices, setIsSyncingDevices] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatusSnapshot>>({});
  const [deviceBusyMap, setDeviceBusyMap] = useState<Record<string, DeviceControlAction | 'refresh' | null>>({});
  const [deviceFeedbackMap, setDeviceFeedbackMap] = useState<Record<string, string>>({});
  const [deviceFeedbackToneMap, setDeviceFeedbackToneMap] = useState<Record<string, 'neutral' | 'success' | 'danger'>>({});

  const dragStateRef = useRef<DragState | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressCountdownRef = useRef<number | null>(null);
  const longPressDeadlineRef = useRef<number | null>(null);
  const hintResetTimerRef = useRef<number | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const loginPollTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    void hydrate();

    return () => {
      isMountedRef.current = false;
      clearLongPressState();
      clearHintResetTimer();
      clearLoginPollTimer();
      if (moveFrameRef.current !== null) {
        window.cancelAnimationFrame(moveFrameRef.current);
      }
    };
  }, []);

  const dragProgressStyle: ProgressStyle = {
    '--drag-progress': `${dragProgress}`,
  };

  const deviceStats = useMemo(() => {
    const onlineCount = devices.filter((device) => device.isOnline).length;
    const cloudCount = devices.filter((device) => device.capability.supportsCloudControl).length;
    const localCount = devices.filter((device) => device.capability.supportsLocalControl).length;

    return {
      total: devices.length,
      onlineCount,
      offlineCount: devices.length - onlineCount,
      cloudCount,
      localCount,
    };
  }, [devices]);

  const heroTitle =
    session?.status === 'success'
      ? '米家设备已连接'
      : session?.status === 'pending'
        ? '等待扫码登录'
        : '准备连接米家账号';

  const heroDescription =
    session?.status === 'success'
      ? '会话已可用，现在可以在这个窗口里直接刷新状态、同步设备并下发最小控制指令。'
      : qrTicket
        ? '登录任务已创建，请使用米家 App 扫码完成授权。'
        : '当前已经接上 MiHome Bridge Service，下一步就是拉起扫码登录并同步设备。';

  async function hydrate() {
    setIsHydrating(true);
    setBootError(null);

    const [versionResult, configResult, sessionResult, deviceResult] = await Promise.allSettled([
      window.mijia.app.getVersion(),
      window.mijia.config.load(),
      window.mijia.auth.getSession(),
      window.mijia.device.getAll(),
    ]);

    if (!isMountedRef.current) {
      return;
    }

    if (versionResult.status === 'fulfilled') {
      setVersion(versionResult.value);
    } else {
      setBootError(normalizeErrorMessage(versionResult.reason));
    }

    if (configResult.status === 'fulfilled') {
      setConfig(configResult.value);
      setIsPinned(configResult.value.window.alwaysOnTop);
    } else {
      setBootError(normalizeErrorMessage(configResult.reason));
    }

    if (sessionResult.status === 'fulfilled') {
      setSession(sessionResult.value);
      setSessionError(null);
    } else {
      setSessionError(normalizeErrorMessage(sessionResult.reason));
    }

    if (deviceResult.status === 'fulfilled') {
      setDevices(sortDevices(deviceResult.value));
      setDeviceError(null);
    } else {
      setDeviceError(normalizeErrorMessage(deviceResult.reason));
    }

    setIsHydrating(false);
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

  async function handleRefreshSession() {
    setIsRefreshingSession(true);
    setSessionError(null);

    try {
      const nextSession = await window.mijia.auth.getSession();
      if (!isMountedRef.current) {
        return;
      }

      setSession(nextSession);
      if (nextSession.status === 'success') {
        setQrTicket(null);
      }
    } catch (refreshError) {
      if (!isMountedRef.current) {
        return;
      }

      setSessionError(normalizeErrorMessage(refreshError));
    } finally {
      if (isMountedRef.current) {
        setIsRefreshingSession(false);
      }
    }
  }

  async function handleStartQrLogin() {
    setIsStartingLogin(true);
    setSessionError(null);

    try {
      const ticket = await window.mijia.auth.startQrLogin(resolveRegion(config?.miHome.region));
      if (!isMountedRef.current) {
        return;
      }

      setQrTicket(ticket);
      setSession({
        status: 'pending',
        region: resolveRegion(config?.miHome.region),
        message: '等待手机端扫码确认',
      });
      scheduleLoginPoll(ticket.ticketId);
    } catch (loginError) {
      if (!isMountedRef.current) {
        return;
      }

      setSessionError(normalizeErrorMessage(loginError));
    } finally {
      if (isMountedRef.current) {
        setIsStartingLogin(false);
      }
    }
  }

  async function handleLogout() {
    setSessionError(null);
    clearLoginPollTimer();

    try {
      const nextSession = await window.mijia.auth.logout();
      if (!isMountedRef.current) {
        return;
      }

      setSession(nextSession);
      setQrTicket(null);
    } catch (logoutError) {
      if (!isMountedRef.current) {
        return;
      }

      setSessionError(normalizeErrorMessage(logoutError));
    }
  }

  async function handleLoadCachedDevices() {
    setDeviceError(null);

    try {
      const cachedDevices = await window.mijia.device.getAll();
      if (!isMountedRef.current) {
        return;
      }

      setDevices(sortDevices(cachedDevices));
    } catch (loadError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceError(normalizeErrorMessage(loadError));
    }
  }

  async function handleSyncDevices() {
    setIsSyncingDevices(true);
    setDeviceError(null);

    try {
      const syncedDevices = await window.mijia.device.syncFromCloud();
      if (!isMountedRef.current) {
        return;
      }

      setDevices(sortDevices(syncedDevices));
      setLastSyncedAt(new Date().toISOString());
    } catch (syncError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceError(normalizeErrorMessage(syncError));
    } finally {
      if (isMountedRef.current) {
        setIsSyncingDevices(false);
      }
    }
  }

  async function handleRefreshDeviceStatus(deviceId: string) {
    setDeviceBusy(deviceId, 'refresh');

    try {
      const status = await window.mijia.device.getStatus(deviceId);
      if (!isMountedRef.current) {
        return;
      }

      setDeviceStatuses((current) => ({
        ...current,
        [deviceId]: status,
      }));
      setDeviceFeedback(deviceId, status.message ?? '状态已刷新。', 'neutral');
    } catch (statusError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceFeedback(deviceId, normalizeErrorMessage(statusError), 'danger');
    } finally {
      if (isMountedRef.current) {
        setDeviceBusy(deviceId, null);
      }
    }
  }

  async function handleControlDevice(deviceId: string, action: 'turnOn' | 'turnOff') {
    setDeviceBusy(deviceId, action);

    try {
      const result = await window.mijia.device.control({ deviceId, action });
      if (!isMountedRef.current) {
        return;
      }

      if (result.updatedStatus) {
        setDeviceStatuses((current) => ({
          ...current,
          [deviceId]: result.updatedStatus as DeviceStatusSnapshot,
        }));
      }

      setDeviceFeedback(
        deviceId,
        result.message ?? (result.success ? '控制成功。' : '控制失败。'),
        result.success ? 'success' : 'danger',
      );
    } catch (controlError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceFeedback(deviceId, normalizeErrorMessage(controlError), 'danger');
    } finally {
      if (isMountedRef.current) {
        setDeviceBusy(deviceId, null);
      }
    }
  }

  function setDeviceBusy(deviceId: string, action: DeviceControlAction | 'refresh' | null) {
    setDeviceBusyMap((current) => ({
      ...current,
      [deviceId]: action,
    }));
  }

  function setDeviceFeedback(
    deviceId: string,
    message: string,
    tone: 'neutral' | 'success' | 'danger',
  ) {
    setDeviceFeedbackMap((current) => ({
      ...current,
      [deviceId]: message,
    }));
    setDeviceFeedbackToneMap((current) => ({
      ...current,
      [deviceId]: tone,
    }));
  }

  function scheduleLoginPoll(ticketId: string) {
    clearLoginPollTimer();

    const pollOnce = async () => {
      try {
        const snapshot = await window.mijia.auth.pollQrLogin(ticketId);
        if (!isMountedRef.current) {
          return;
        }

        setSession(snapshot);

        if (snapshot.status === 'pending') {
          loginPollTimerRef.current = window.setTimeout(pollOnce, LOGIN_POLL_INTERVAL_MS);
          return;
        }

        clearLoginPollTimer();
        if (snapshot.status === 'success') {
          setQrTicket(null);
          await handleSyncDevices();
        }
      } catch (pollError) {
        if (!isMountedRef.current) {
          return;
        }

        clearLoginPollTimer();
        setSessionError(normalizeErrorMessage(pollError));
      }
    };

    void pollOnce();
  }

  function clearLoginPollTimer() {
    if (loginPollTimerRef.current !== null) {
      window.clearTimeout(loginPollTimerRef.current);
      loginPollTimerRef.current = null;
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

      <section className="hero-card card">
        <div>
          <p className="eyebrow">Mijia Desktop Sticky</p>
          <h1>{heroTitle}</h1>
          <p className="description">{heroDescription}</p>
        </div>
        <div className="hero-meta">
          <span className={`status-pill status-pill--${STATUS_TONES[session?.status ?? 'idle']}`}>
            {STATUS_LABELS[session?.status ?? 'idle']}
          </span>
          <span className="meta-chip">v{version || '--'}</span>
          <span className="meta-chip">{isPinned ? '已置顶' : '未置顶'}</span>
        </div>
      </section>

      {(bootError || sessionError || deviceError) && (
        <section className="alert-stack">
          {bootError ? <div className="alert alert--danger">{bootError}</div> : null}
          {sessionError ? <div className="alert alert--warning">{sessionError}</div> : null}
          {deviceError ? <div className="alert alert--warning">{deviceError}</div> : null}
        </section>
      )}

      <section className="grid grid--top">
        <article className="panel auth-panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">M01</p>
              <h2>扫码登录状态</h2>
            </div>
            <span className={`status-pill status-pill--${STATUS_TONES[session?.status ?? 'idle']}`}>
              {STATUS_LABELS[session?.status ?? 'idle']}
            </span>
          </div>

          <dl className="key-value-list">
            <div>
              <dt>Account</dt>
              <dd>{session?.accountId ?? '--'}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{resolveRegion(session?.region ?? config?.miHome.region).toUpperCase()}</dd>
            </div>
            <div>
              <dt>Last Login</dt>
              <dd>{formatDateTime(session?.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>Bridge</dt>
              <dd>{config?.services.mihomeBridge.baseUrl ?? '--'}</dd>
            </div>
          </dl>

          <p className="panel__message">
            {session?.message ??
              (session?.status === 'success'
                ? '会话已可用，可以直接执行设备同步和状态刷新。'
                : '还没有可用会话，可以在右侧启动一次扫码登录。')}
          </p>

          <div className="button-row">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                void handleRefreshSession();
              }}
              disabled={isRefreshingSession || isHydrating}
            >
              {isRefreshingSession ? '刷新中...' : '刷新状态'}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void handleStartQrLogin();
              }}
              disabled={isStartingLogin || session?.status === 'pending'}
            >
              {isStartingLogin ? '生成中...' : '开始扫码登录'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                void handleLogout();
              }}
              disabled={session?.status !== 'success'}
            >
              退出登录
            </button>
          </div>
        </article>

        <article className="panel qr-panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">M01</p>
              <h2>扫码登录</h2>
            </div>
            {qrTicket ? <span className="meta-chip">{formatDateTime(qrTicket.expiresAt)} 过期</span> : null}
          </div>

          {qrTicket ? (
            <>
              <div className="qr-card">
                <img src={qrTicket.qrCodeData} alt="MiHome login QR code" className="qr-card__image" />
              </div>
              <p className="qr-card__hint">
                请使用米家 App 扫码确认。当前界面会自动轮询登录结果，成功后会立即触发设备同步。
              </p>
            </>
          ) : (
            <div className="empty-state">
              <p>还没有正在进行的扫码任务</p>
              <span>点击左侧按钮后，会在这里展示二维码</span>
            </div>
          )}
        </article>
      </section>

      <section className="grid grid--bottom">
        <article className="panel device-panel device-panel--wide">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">M02 + M03</p>
              <h2>设备同步与控制</h2>
            </div>
            <div className="hero-meta hero-meta--compact">
              <span className="meta-chip">{deviceStats.total} 总设备</span>
              <span className="meta-chip">{deviceStats.onlineCount} 在线</span>
              <span className="meta-chip">{deviceStats.cloudCount} 云控</span>
            </div>
          </div>

          <div className="button-row button-row--wrap">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                void handleLoadCachedDevices();
              }}
            >
              读取缓存
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                void handleSyncDevices();
              }}
              disabled={isSyncingDevices || session?.status !== 'success'}
            >
              {isSyncingDevices ? '同步中...' : '从云端同步'}
            </button>
            <span className="inline-note">
              {lastSyncedAt ? `上次同步：${formatDateTime(lastSyncedAt)}` : '还没有本轮同步记录'}
            </span>
          </div>

          {devices.length > 0 ? (
            <div className="device-list">
              {devices.map((device) => {
                const status = deviceStatuses[device.id];
                const busyAction = deviceBusyMap[device.id];
                const feedback = deviceFeedbackMap[device.id];
                const feedbackTone = deviceFeedbackToneMap[device.id] ?? 'neutral';
                const controllable = canControlDevice(device);

                return (
                  <article
                    key={device.id}
                    className={`device-item${busyAction ? ' device-item--busy' : ''}`}
                  >
                    <div className="device-item__header">
                      <div>
                        <h3>{device.name}</h3>
                        <p>{device.model}</p>
                      </div>
                      <div className="device-item__badges">
                        <span
                          className={`status-pill status-pill--${
                            (status?.online ?? device.isOnline) ? 'success' : 'neutral'
                          }`}
                        >
                          {(status?.online ?? device.isOnline) ? '在线' : '离线'}
                        </span>
                        <span className="meta-chip">{device.capability.preferredRoute}</span>
                        <span
                          className={`meta-chip${
                            status?.power === true
                              ? ' meta-chip--success'
                              : status?.power === false
                                ? ' meta-chip--danger'
                                : ''
                          }`}
                        >
                          {status?.power === true ? '已开启' : status?.power === false ? '已关闭' : '状态未知'}
                        </span>
                      </div>
                    </div>

                    <dl className="device-item__meta">
                      <div>
                        <dt>Home</dt>
                        <dd>{device.homeId}</dd>
                      </div>
                      <div>
                        <dt>Room</dt>
                        <dd>{device.roomName ?? '--'}</dd>
                      </div>
                      <div>
                        <dt>DID</dt>
                        <dd>{device.cloudContext?.did ?? device.id}</dd>
                      </div>
                      <div>
                        <dt>Last Status</dt>
                        <dd>{formatDateTime(status?.updatedAt)}</dd>
                      </div>
                    </dl>

                    <div className="device-item__footer">
                      <div className="device-item__controls">
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          onClick={() => {
                            void handleRefreshDeviceStatus(device.id);
                          }}
                          disabled={busyAction != null}
                        >
                          {busyAction === 'refresh' ? DEVICE_ACTION_LABELS.refresh : '刷新状态'}
                        </button>
                        <button
                          type="button"
                          className="button button--small"
                          onClick={() => {
                            void handleControlDevice(device.id, 'turnOn');
                          }}
                          disabled={!controllable || busyAction != null}
                        >
                          {busyAction === 'turnOn' ? DEVICE_ACTION_LABELS.turnOn : '开启'}
                        </button>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => {
                            void handleControlDevice(device.id, 'turnOff');
                          }}
                          disabled={!controllable || busyAction != null}
                        >
                          {busyAction === 'turnOff' ? DEVICE_ACTION_LABELS.turnOff : '关闭'}
                        </button>
                      </div>
                      <div className="device-item__hint-group">
                        <p className="device-item__hint">
                          {controllable ? '当前设备已进入 M02 最小控制范围。' : '当前设备暂未进入首期统一控制范围。'}
                        </p>
                        {feedback ? (
                          <p className={`device-item__feedback device-item__feedback--${feedbackTone}`}>
                            {feedback}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state empty-state--large">
              <p>暂时还没有设备数据</p>
              <span>你可以先登录，然后点“从云端同步”把设备拉进来</span>
            </div>
          )}
        </article>

        <article className="panel diagnostics-panel">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Runtime</p>
              <h2>运行信息</h2>
            </div>
          </div>

          <dl className="key-value-list">
            <div>
              <dt>Hydrating</dt>
              <dd>{isHydrating ? 'yes' : 'no'}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{resolveRegion(config?.miHome.region).toUpperCase()}</dd>
            </div>
            <div>
              <dt>Bridge Timeout</dt>
              <dd>{config?.services.mihomeBridge.timeoutMs ?? '--'} ms</dd>
            </div>
            <div>
              <dt>Window Opacity</dt>
              <dd>{config?.window.opacity ?? '--'}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}

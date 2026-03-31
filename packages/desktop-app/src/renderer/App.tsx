import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { LogOut, Pin, RefreshCw, ScanLine, Settings, UserRound } from 'lucide-react';
import type { AppConfig } from '../shared/config/types';
import type {
  DeviceControlAction,
  DeviceStatusSnapshot,
  LoginStatus,
  MiHomeDeviceSummary,
  MiHomeQrLoginTicket,
  MiHomeSessionSnapshot,
} from '../shared/mihome/types';

const LONG_PRESS_DELAY_MS = 2000;
const LONG_PRESS_TICK_MS = 100;
const HINT_RESET_DELAY_MS = 1200;
const LOGIN_POLL_INTERVAL_MS = 2000;

const DEFAULT_DRAG_HINT = '长按底部横条 2 秒后拖动窗口';
const DRAG_HOLDING_HINT = '继续按住，进度填满后开始拖动';
const DRAG_ACTIVE_HINT = '正在拖动窗口';
const PINNED_ON_HINT = '已开启置顶';
const PINNED_OFF_HINT = '已取消置顶';

const STATUS_LABELS: Record<LoginStatus, string> = {
  idle: '未登录',
  pending: '等待扫码',
  success: '已连接',
  expired: '二维码过期',
  error: '连接异常',
};

const DEVICE_BUSY_LABELS: Partial<Record<DeviceControlAction | 'refresh', string>> = {
  refresh: '刷新中',
  turnOn: '开启中',
  turnOff: '关闭中',
};

type ThemeMode = 'light' | 'dark';
type DeviceTone =
  | 'environment'
  | 'light'
  | 'speaker'
  | 'water'
  | 'router'
  | 'socket'
  | 'camera'
  | 'generic';

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ProgressStyle extends CSSProperties {
  '--drag-progress': string;
}

interface FloatingAlertMessage {
  key: string;
  tone: 'danger' | 'warning';
  message: string;
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function resolveAppTheme(theme: AppConfig['appearance']['theme'] | undefined): ThemeMode {
  if (theme === 'dark') {
    return 'dark';
  }

  if (theme === 'light') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function canControlDevice(device: MiHomeDeviceSummary): boolean {
  return (
    device.capability.supportedActions?.includes('turnOn') === true ||
    device.capability.supportedActions?.includes('turnOff') === true
  );
}

function supportsDeviceAction(
  device: MiHomeDeviceSummary,
  action: Extract<DeviceControlAction, 'turnOn' | 'turnOff' | 'toggle'>,
): boolean {
  return device.capability.supportedActions?.includes(action) ?? false;
}

function buildRoomTabs(devices: MiHomeDeviceSummary[]): string[] {
  const roomNames = new Set<string>();

  for (const device of devices) {
    if (device.roomName?.trim()) {
      roomNames.add(device.roomName.trim());
    }
  }

  return ['全屋', ...Array.from(roomNames).sort((left, right) => left.localeCompare(right, 'zh-CN'))];
}

function getDeviceSearchText(device: MiHomeDeviceSummary): string {
  return `${device.name} ${device.originalName} ${device.model}`.toLowerCase();
}

function getDeviceTone(device: MiHomeDeviceSummary): DeviceTone {
  const text = getDeviceSearchText(device);

  if (text.includes('环境') || text.includes('sensor') || text.includes('温') || text.includes('湿')) {
    return 'environment';
  }

  if (text.includes('灯') || text.includes('light')) {
    return 'light';
  }

  if (text.includes('音箱') || text.includes('speaker')) {
    return 'speaker';
  }

  if (text.includes('路由') || text.includes('router')) {
    return 'router';
  }

  if (text.includes('热水') || text.includes('净饮') || text.includes('饮水') || text.includes('水')) {
    return 'water';
  }

  if (text.includes('鎻掑骇') || text.includes('socket') || text.includes('plug') || text.includes('outlet')) {
    return 'socket';
  }

  if (text.includes('摄像') || text.includes('camera')) {
    return 'camera';
  }

  return 'generic';
}

function getDeviceGlyph(device: MiHomeDeviceSummary, tone: DeviceTone): string {
  return device.name.slice(0, 1) || '设';
}

function getDeviceSortWeight(device: MiHomeDeviceSummary): number {
  const tone = getDeviceTone(device);

  if (tone === 'environment') {
    return 0;
  }

  if (canControlDevice(device)) {
    return 1;
  }

  return 2;
}

function sortDashboardDevices(devices: MiHomeDeviceSummary[]): MiHomeDeviceSummary[] {
  return [...devices].sort((left, right) => {
    const leftWeight = getDeviceSortWeight(left);
    const rightWeight = getDeviceSortWeight(right);

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    if (left.isOnline !== right.isOnline) {
      return left.isOnline ? -1 : 1;
    }

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

function getPowerState(device: MiHomeDeviceSummary, status?: DeviceStatusSnapshot): boolean | undefined {
  if (typeof status?.power === 'boolean') {
    return status.power;
  }

  if (!canControlDevice(device)) {
    return undefined;
  }

  return undefined;
}

function getDeviceStatusLine(device: MiHomeDeviceSummary, status?: DeviceStatusSnapshot): string {
  if (!(status?.online ?? device.isOnline)) {
    return '离线';
  }

  if (status?.power === true) {
    return '已开启';
  }

  if (status?.power === false) {
    return '已关闭';
  }

  if (canControlDevice(device)) {
    return '可切换';
  }

  return device.capability.capabilityMessage ?? '仅展示';
}

export function App() {
  const [version, setVersion] = useState<string>('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [dragHint, setDragHint] = useState<string>(DEFAULT_DRAG_HINT);
  const [dragProgress, setDragProgress] = useState<number>(0);
  const [isDragReady, setIsDragReady] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [session, setSession] = useState<MiHomeSessionSnapshot | null>(null);
  const [devices, setDevices] = useState<MiHomeDeviceSummary[]>([]);
  const [qrTicket, setQrTicket] = useState<MiHomeQrLoginTicket | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);
  const [isStartingLogin, setIsStartingLogin] = useState<boolean>(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState<boolean>(false);
  const [isSyncingDevices, setIsSyncingDevices] = useState<boolean>(false);
  const [isQuittingApp, setIsQuittingApp] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('全屋');
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatusSnapshot>>({});
  const [deviceBusyMap, setDeviceBusyMap] = useState<Record<string, DeviceControlAction | 'refresh' | null>>({});
  const [deviceFeedbackMap, setDeviceFeedbackMap] = useState<Record<string, string>>({});
  const [deviceFeedbackToneMap, setDeviceFeedbackToneMap] = useState<Record<string, 'neutral' | 'success' | 'danger'>>(
    {},
  );
  const [deviceIconErrorMap, setDeviceIconErrorMap] = useState<Record<string, boolean>>({});

  const dragStateRef = useRef<DragState | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressCountdownRef = useRef<number | null>(null);
  const longPressDeadlineRef = useRef<number | null>(null);
  const hintResetTimerRef = useRef<number | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const loginPollTimerRef = useRef<number | null>(null);
  const autoRefreshTimerRef = useRef<number | null>(null);
  const autoRefreshBusyRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);
  const initialDeviceSyncRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    void hydrate();

    return () => {
      isMountedRef.current = false;
      clearLongPressState();
      clearHintResetTimer();
      clearLoginPollTimer();
      clearAutoRefreshTimer();
      if (moveFrameRef.current !== null) {
        window.cancelAnimationFrame(moveFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!config) {
      return;
    }

    const resolvedTheme = resolveAppTheme(config.appearance.theme);
    const backgroundOpacity = config.window.backgroundOpacity ?? config.window.opacity ?? 0.72;
    const interactionOpacity = config.window.interactionOpacity ?? 0.88;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.setProperty('--app-font-size', `${config.appearance.fontSize}px`);
    document.documentElement.style.setProperty('--window-background-opacity', `${backgroundOpacity}`);
    document.documentElement.style.setProperty('--window-interaction-opacity', `${interactionOpacity}`);
  }, [config]);

  const roomTabs = useMemo(() => buildRoomTabs(devices), [devices]);

  useEffect(() => {
    if (!roomTabs.includes(selectedRoom)) {
      setSelectedRoom('全屋');
    }
  }, [roomTabs, selectedRoom]);

  useEffect(() => {
    setDeviceIconErrorMap({});
  }, [devices]);

  useEffect(() => {
    clearAutoRefreshTimer();

    if (!config?.devices.autoRefresh || session?.status !== 'success') {
      return;
    }

    autoRefreshTimerRef.current = window.setInterval(() => {
      void handleAutoRefreshDevices();
    }, config.devices.refreshInterval * 1000);

    return () => {
      clearAutoRefreshTimer();
    };
  }, [config?.devices.autoRefresh, config?.devices.refreshInterval, session?.status]);

  useEffect(() => {
    if (session?.status !== 'success') {
      initialDeviceSyncRef.current = false;
      return;
    }

    if (isHydrating || isSyncingDevices || devices.length > 0 || initialDeviceSyncRef.current) {
      return;
    }

    initialDeviceSyncRef.current = true;
    void handleSyncDevices();
  }, [devices.length, isHydrating, isSyncingDevices, session?.status]);

  const visibleDevices = useMemo(() => {
    const filtered =
      selectedRoom === '全屋'
        ? devices
        : devices.filter((device) => (device.roomName ?? '未分配房间') === selectedRoom);

    return sortDashboardDevices(filtered);
  }, [devices, selectedRoom]);

  useEffect(() => {
    if (session?.status !== 'success' || visibleDevices.length === 0) {
      return;
    }

    const candidates = visibleDevices
      .filter((device) => canControlDevice(device))
      .filter((device) => deviceStatuses[device.id] === undefined)
      .slice(0, 6);

    if (candidates.length === 0) {
      return;
    }

    let disposed = false;

    void Promise.allSettled(
      candidates.map(async (device) => ({
        deviceId: device.id,
        snapshot: await window.mijia.device.getStatus(device.id),
      })),
    ).then((results) => {
      if (disposed || !isMountedRef.current) {
        return;
      }

      setDeviceStatuses((current) => {
        const next = { ...current };

        for (const result of results) {
          if (result.status === 'fulfilled') {
            next[result.value.deviceId] = result.value.snapshot;
          }
        }

        return next;
      });
    });

    return () => {
      disposed = true;
    };
  }, [deviceStatuses, session?.status, visibleDevices]);

  const dragProgressStyle: ProgressStyle = {
    '--drag-progress': `${dragProgress}`,
  };

  const resolvedTheme = resolveAppTheme(config?.appearance.theme);
  const isLoggedIn = session?.status === 'success';
  const appearanceTheme = config?.appearance.theme ?? 'system';
  const appearanceFontSize = config?.appearance.fontSize ?? 14;
  const windowBackgroundOpacity = config?.window.backgroundOpacity ?? config?.window.opacity ?? 0.72;
  const windowInteractionOpacity = config?.window.interactionOpacity ?? 0.88;
  const windowSkipTaskbar = config?.window.skipTaskbar ?? true;
  const deviceAutoRefresh = config?.devices.autoRefresh ?? true;
  const deviceRefreshInterval = config?.devices.refreshInterval ?? 300;
  const sessionAccountLabel = session?.accountId?.trim() || '米家账户';

  const alertMessages = useMemo<FloatingAlertMessage[]>(
    () =>
      [
        bootError ? { key: 'boot', tone: 'danger' as const, message: bootError } : null,
        sessionError ? { key: 'session', tone: 'warning' as const, message: sessionError } : null,
        deviceError ? { key: 'device', tone: 'warning' as const, message: deviceError } : null,
        settingsError ? { key: 'settings', tone: 'warning' as const, message: settingsError } : null,
      ].filter((item): item is FloatingAlertMessage => item !== null),
    [bootError, deviceError, sessionError, settingsError],
  );

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
      setLastSyncedAt(configResult.value.devices.lastSyncAt ?? null);
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
      setDevices(sortDashboardDevices(deviceResult.value));
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

    queueWindowMove(event.screenX - dragState.offsetX, event.screenY - dragState.offsetY);
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
    setIsQrModalOpen(true);

    try {
      const ticket = await window.mijia.auth.startQrLogin(resolveRegion(config?.miHome.region));
      if (!isMountedRef.current) {
        return;
      }

      setQrTicket(ticket);
      setSession({
        status: 'pending',
        region: resolveRegion(config?.miHome.region),
        message: '请使用米家 App 扫码确认登录。',
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
      setIsQrModalOpen(false);
    } catch (logoutError) {
      if (!isMountedRef.current) {
        return;
      }

      setSessionError(normalizeErrorMessage(logoutError));
    }
  }

  async function applyConfigValue<T>(key: string, value: T) {
    setSettingsError(null);

    try {
      const nextConfig = await window.mijia.config.set(key, value);
      if (!isMountedRef.current) {
        return;
      }

      setConfig(nextConfig);
      setIsPinned(nextConfig.window.alwaysOnTop);
      setLastSyncedAt(nextConfig.devices.lastSyncAt ?? null);
    } catch (configError) {
      if (!isMountedRef.current) {
        return;
      }

      setSettingsError(normalizeErrorMessage(configError));
    }
  }

  async function persistLastSyncedAt(timestamp: string) {
    try {
      const nextConfig = await window.mijia.config.set('devices.lastSyncAt', timestamp);
      if (!isMountedRef.current) {
        return;
      }

      setConfig(nextConfig);
      setLastSyncedAt(nextConfig.devices.lastSyncAt ?? timestamp);
    } catch (configError) {
      if (!isMountedRef.current) {
        return;
      }

      setSettingsError(normalizeErrorMessage(configError));
    }
  }

  async function handleSyncDevices() {
    if (session?.status !== 'success') {
      await handleRefreshSession();
      return;
    }

    setIsSyncingDevices(true);
    setDeviceError(null);

    try {
      const syncedDevices = await window.mijia.device.syncFromCloud();
      if (!isMountedRef.current) {
        return;
      }

      const syncedAt = new Date().toISOString();
      resetDeviceRuntimeState();
      setDevices(sortDashboardDevices(syncedDevices));
      setLastSyncedAt(syncedAt);
      await persistLastSyncedAt(syncedAt);
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

  async function handleAutoRefreshDevices() {
    if (autoRefreshBusyRef.current || session?.status !== 'success') {
      return;
    }

    autoRefreshBusyRef.current = true;

    try {
      const syncedDevices = await window.mijia.device.syncFromCloud();
      if (!isMountedRef.current) {
        return;
      }

      const syncedAt = new Date().toISOString();
      resetDeviceRuntimeState();
      setDevices(sortDashboardDevices(syncedDevices));
      setLastSyncedAt(syncedAt);
      await persistLastSyncedAt(syncedAt);
    } catch (syncError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceError(normalizeErrorMessage(syncError));
    } finally {
      autoRefreshBusyRef.current = false;
    }
  }

  async function handleResetWindowPosition() {
    setSettingsError(null);

    try {
      await window.mijia.window.resetPosition();
      const nextConfig = await window.mijia.config.load();
      if (!isMountedRef.current) {
        return;
      }

      setConfig(nextConfig);
    } catch (resetError) {
      if (!isMountedRef.current) {
        return;
      }

      setSettingsError(normalizeErrorMessage(resetError));
    }
  }

  async function handleQuitApp() {
    setSettingsError(null);
    setIsQuittingApp(true);

    try {
      await window.mijia.app.quit();
    } catch (quitError) {
      if (!isMountedRef.current) {
        return;
      }

      setIsQuittingApp(false);
      setSettingsError(normalizeErrorMessage(quitError));
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
      setDeviceFeedback(deviceId, status.message ?? '鐘舵€佸凡鍒锋柊', 'neutral');
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
        result.message ?? (result.success ? '鎺у埗鎴愬姛' : '鎺у埗澶辫触'),
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

  async function handleToggleDevice(device: MiHomeDeviceSummary) {
    const currentStatus = deviceStatuses[device.id];
    const currentPower = getPowerState(device, currentStatus);
    const nextAction = currentPower === true ? 'turnOff' : 'turnOn';

    if (!supportsDeviceAction(device, nextAction)) {
      if (currentStatus === undefined) {
        await handleRefreshDeviceStatus(device.id);
      }
      return;
    }

    await handleControlDevice(device.id, nextAction);
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

  function resetDeviceRuntimeState() {
    setDeviceStatuses({});
    setDeviceBusyMap({});
    setDeviceFeedbackMap({});
    setDeviceFeedbackToneMap({});
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
          setIsQrModalOpen(false);
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

  function clearAutoRefreshTimer() {
    if (autoRefreshTimerRef.current !== null) {
      window.clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
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

  async function handleToggleAlwaysOnTop() {
    clearLongPressState();
    clearHintResetTimer();
    dragStateRef.current = null;
    setIsDragReady(false);
    setDragProgress(0);

    const nextPinned = !(config?.window.alwaysOnTop ?? true);
    await applyConfigValue('window.alwaysOnTop', nextPinned);
    setDragHint(nextPinned ? PINNED_ON_HINT : PINNED_OFF_HINT);
    hintResetTimerRef.current = window.setTimeout(() => {
      setDragHint(DEFAULT_DRAG_HINT);
      hintResetTimerRef.current = null;
    }, HINT_RESET_DELAY_MS);
  }

  return (
    <main
      className={`app-shell app-shell--${resolvedTheme}${isSettingsOpen ? ' app-shell--settings-open' : ''}`}
    >
      <div className="app-shell__glow app-shell__glow--left" />
      <div className="app-shell__glow app-shell__glow--right" />

      {alertMessages.length > 0 ? (
        <section className="floating-alerts">
          {alertMessages.map((alert) => (
            <div key={alert.key} className={`floating-alert floating-alert--${alert.tone}`}>
              {alert.message}
            </div>
          ))}
        </section>
      ) : null}

      <section className="sticky-window">
        {isLoggedIn ? (
          <>
            <header className="sticky-window__header">
              <div className="room-tabs" role="tablist" aria-label="房间切换">
                {roomTabs.map((room) => (
                  <button
                    key={room}
                    type="button"
                    className={`room-tab${selectedRoom === room ? ' room-tab--active' : ''}`}
                    onClick={() => {
                      setSelectedRoom(room);
                    }}
                  >
                    {room}
                  </button>
                ))}
              </div>

              <div className="window-tools">
                <button
                  type="button"
                  className={`tool-button tool-button--sync${isSyncingDevices ? ' tool-button--busy' : ''}`}
                  onClick={() => {
                    void handleSyncDevices();
                  }}
                  title={isSyncingDevices ? '正在同步设备' : '同步设备'}
                  aria-label={isSyncingDevices ? '正在同步设备' : '同步设备'}
                >
                  <RefreshCw className="tool-icon" strokeWidth={2.1} />
                </button>
                <button
                  type="button"
                  className={`tool-button tool-button--pin${config?.window.alwaysOnTop ? ' tool-button--active' : ''}`}
                  onClick={() => {
                    void handleToggleAlwaysOnTop();
                  }}
                  title={config?.window.alwaysOnTop ? '取消置顶' : '置顶窗口'}
                  aria-label={config?.window.alwaysOnTop ? '取消置顶' : '置顶窗口'}
                >
                  <Pin className={`tool-icon${config?.window.alwaysOnTop ? ' tool-icon--filled' : ''}`} strokeWidth={2.1} />
                </button>
                <button
                  type="button"
                  className={`tool-button tool-button--settings${isSettingsOpen ? ' tool-button--active' : ''}`}
                  onClick={() => {
                    setIsSettingsOpen((current) => !current);
                  }}
                  title="设置"
                  aria-label="设置"
                >
                  <Settings className="tool-icon" strokeWidth={2.1} />
                </button>
              </div>
            </header>

            <div className="sticky-window__subheader">
              <span>{session?.accountId ? `账号 ${session.accountId}` : '米家云端已连接'}</span>
              <span>{lastSyncedAt ? `同步于 ${formatDateTime(lastSyncedAt)}` : '等待首次同步'}</span>
            </div>

            <div className="device-grid">
              {visibleDevices.length > 0 ? (
                visibleDevices.map((device, index) => {
                  const tone = getDeviceTone(device);
                  const glyph = getDeviceGlyph(device, tone);
                  const status = deviceStatuses[device.id];
                  const feedback = deviceFeedbackMap[device.id];
                  const feedbackTone = deviceFeedbackToneMap[device.id] ?? 'neutral';
                  const busyAction = deviceBusyMap[device.id];
                  const powerState = getPowerState(device, status);
                  const isControllable = canControlDevice(device);
                  const roomLabel = device.roomName ?? '未分配房间';
                  const isFeature = tone === 'environment' || (index === 0 && !isControllable);
                  const iconUrl = deviceIconErrorMap[device.id] ? undefined : device.iconUrl;

                  return (
                    <article
                      key={device.id}
                      className={`device-card device-card--${tone}${isFeature ? ' device-card--feature' : ''}`}
                    >
                      <div className="device-card__top">
                        <span className={`device-card__icon device-card__icon--${tone}`}>
                          {iconUrl ? (
                            <img
                              className="device-card__icon-image"
                              src={iconUrl}
                              alt=""
                              loading="lazy"
                              onError={() => {
                                setDeviceIconErrorMap((current) => ({ ...current, [device.id]: true }));
                              }}
                            />
                          ) : (
                            glyph
                          )}
                        </span>

                        {isControllable ? (
                          <button
                            type="button"
                            className={`device-switch${
                              powerState === true ? ' device-switch--on' : ''
                            }${busyAction ? ' device-switch--busy' : ''}`}
                            onClick={() => {
                              void handleToggleDevice(device);
                            }}
                            disabled={busyAction != null}
                            title={busyAction ? (DEVICE_BUSY_LABELS[busyAction] ?? '切换中') : '切换设备'}
                          >
                            <span className="device-switch__thumb" />
                          </button>
                        ) : null}
                      </div>

                      <div className="device-card__content">
                        <div>
                          <h3>{device.name}</h3>
                          <p className="device-card__room">{roomLabel}</p>
                        </div>
                        <p className="device-card__status">
                          {feedback ?? getDeviceStatusLine(device, status)}
                        </p>
                      </div>

                      <div className="device-card__bottom">
                        <span
                          className={`device-pill${
                            status?.online ?? device.isOnline ? ' device-pill--online' : ''
                          }`}
                        >
                          {status?.online ?? device.isOnline ? '在线' : '离线'}
                        </span>
                        {busyAction === 'refresh' ? <span className="device-pill">刷新中</span> : null}
                        {feedback ? (
                          <span className={`device-pill device-pill--${feedbackTone}`}>{feedback}</span>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="dashboard-empty">
                  <p>当前筛选房间还没有设备</p>
                  <span>切换房间标签，或者点击右上角同步按钮刷新设备列表。</span>
                </div>
              )}
            </div>

            <footer className="sticky-window__footer">
              <div className="footer-account" title={sessionAccountLabel}>
                <span className="footer-account__icon" aria-hidden="true">
                  <UserRound className="footer-icon" strokeWidth={2} />
                </span>
                <span className="footer-account__name">{sessionAccountLabel}</span>
              </div>

              <button
                type="button"
                className="footer-action footer-action--danger"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={session?.status !== 'success'}
              >
                <span className="footer-action__icon">
                  <LogOut className="footer-icon" strokeWidth={2} />
                </span>
                <span>退出登录</span>
              </button>
            </footer>
          </>
        ) : (
          <section className="signin-view">
            <div className="signin-view__tools">
              <button
                type="button"
                className={`tool-button tool-button--sync${isRefreshingSession ? ' tool-button--busy' : ''}`}
                onClick={() => {
                  void handleRefreshSession();
                }}
                title={isRefreshingSession ? '正在刷新会话' : '刷新会话'}
                aria-label={isRefreshingSession ? '正在刷新会话' : '刷新会话'}
              >
                <RefreshCw className="tool-icon" strokeWidth={2.1} />
              </button>
              <button
                type="button"
                className={`tool-button tool-button--settings${isSettingsOpen ? ' tool-button--active' : ''}`}
                onClick={() => {
                  setIsSettingsOpen((current) => !current);
                }}
                title="设置"
                aria-label="设置"
              >
                <Settings className="tool-icon" strokeWidth={2.1} />
              </button>
            </div>
            <div className="signin-view__empty">
              <div className="signin-view__cloud" aria-hidden="true">
                <span className="signin-view__cloud-main">☁</span>
                <span className="signin-view__cloud-spark signin-view__cloud-spark--left">✦</span>
                <span className="signin-view__cloud-spark signin-view__cloud-spark--right">✦</span>
              </div>
              <p className="signin-view__empty-text">请登录后同步设备信息</p>
              <div className="signin-view__meta">
                <span className="device-pill device-pill--online">{STATUS_LABELS[session?.status ?? 'idle']}</span>
                <span className="device-pill">{resolveRegion(session?.region ?? config?.miHome.region).toUpperCase()}</span>
                <span className="device-pill">v{version || '--'}</span>
              </div>
            </div>

            <div className="signin-view__footer">
              <button
                type="button"
                className="footer-action footer-action--scan"
                onClick={() => {
                  void handleStartQrLogin();
                }}
                disabled={isStartingLogin}
              >
                <span className="footer-action__icon">
                  <ScanLine className="footer-icon" strokeWidth={2} />
                </span>
                <span>{isStartingLogin ? '准备中' : '扫码登录'}</span>
              </button>

              <button
                type="button"
                className="footer-action footer-action--danger"
                onClick={() => {
                  void handleQuitApp();
                }}
                disabled={isQuittingApp}
              >
                <span className="footer-action__icon">
                  <LogOut className="footer-icon" strokeWidth={2} />
                </span>
                <span>{isQuittingApp ? '退出中' : '退出程序'}</span>
              </button>
            </div>

            <div className="signin-view__content">
              <p className="signin-view__eyebrow">MiStick</p>
              <h1>米家桌面便利贴</h1>
              <p className="signin-view__description">
                {session?.status === 'pending'
                  ? '二维码已生成，请在手机上完成授权。'
                  : '连接米家账号后，就能把设备卡片放进这个便利贴窗口里。'}
              </p>

              <div className="signin-view__status">
                <span className="device-pill device-pill--online">{STATUS_LABELS[session?.status ?? 'idle']}</span>
                <span className="device-pill">{resolveRegion(session?.region ?? config?.miHome.region).toUpperCase()}</span>
                <span className="device-pill">v{version || '--'}</span>
              </div>

              <div className="signin-view__actions">
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => {
                    void handleStartQrLogin();
                  }}
                  disabled={isStartingLogin}
                >
                  {isStartingLogin ? '生成二维码中...' : '开始扫码登录'}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    void handleRefreshSession();
                  }}
                  disabled={isRefreshingSession}
                >
                  {isRefreshingSession ? '刷新中...' : '刷新会话'}
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="drag-rail-wrap">
          <div className='drag-rail-aside'>
          </div>
          <div className="drag-rail-shell" aria-hidden="true">
            <div
              className={`drag-rail${isDragReady ? ' drag-rail--active' : ''}`}
              onPointerDown={handleDragPointerDown}
              onPointerMove={handleDragPointerMove}
              onPointerUp={handleDragPointerUp}
              onPointerCancel={handleDragPointerCancel}
              title={dragHint}
              aria-label={dragHint}
            >
              <div className="drag-rail__track">
                <div className="drag-rail__fill" style={dragProgressStyle} />
              </div>
            </div>
          </div>
          <div className='drag-rail-aside'>
            <div className='drag-rail-aside-inner-left' />
          </div>
        </div>
      </section>

      {isQrModalOpen ? (
        <>
          <section className="overlay-card overlay-card--qr">
            <div className="qr-modal__window">
              <div className="qr-modal__header">
                <h2>请使用米家 APP 扫码登录</h2>
                <button
                  type="button"
                  className="qr-modal__close"
                  onClick={() => {
                    setIsQrModalOpen(false);
                  }}
                  aria-label="关闭弹窗"
                >
                  ×
                </button>
              </div>

              <div className="qr-modal__body">
                {qrTicket ? (
                  <button
                    type="button"
                    className="qr-modal__image-wrap qr-modal__image-wrap--framed qr-modal__refresh-trigger"
                    onClick={() => {
                      void handleStartQrLogin();
                    }}
                    disabled={isStartingLogin}
                    title="点击刷新二维码"
                    aria-label="点击刷新二维码"
                  >
                    <img
                      src={qrTicket.qrCodeData}
                      alt="米家扫码登录二维码"
                      className="qr-modal__image"
                    />
                  </button>
                ) : (
                  <div className="qr-modal__placeholder qr-modal__placeholder--framed">
                    <p>{isStartingLogin ? '正在生成二维码…' : '准备创建扫码任务…'}</p>
                  </div>
                )}
                <p className="qr-modal__refresh-hint">点击刷新二维码</p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <div
        className={`settings-backdrop${isSettingsOpen ? ' settings-backdrop--open' : ''}`}
        onClick={() => {
          setIsSettingsOpen(false);
        }}
      />
      <aside
        className={`settings-panel${isSettingsOpen ? ' settings-panel--open' : ''}`}
        aria-hidden={!isSettingsOpen}
      >
        <div className="settings-panel__header">
          <div>
            <p className="settings-panel__eyebrow">Settings</p>
            <h2>璁剧疆</h2>
          </div>
          <button
            type="button"
            className="tool-button"
            onClick={() => {
              setIsSettingsOpen(false);
            }}
          >
            脳
          </button>
        </div>

        <section className="settings-section">
          <div className="settings-section__header">
            <h3>窗口</h3>
            <span className="device-pill">{isPinned ? '置顶中' : '未置顶'}</span>
          </div>
          <label className="settings-field settings-field--inline">
            <span>始终置顶</span>
            <input
              type="checkbox"
              checked={config?.window.alwaysOnTop ?? true}
              onChange={(event) => {
                void applyConfigValue('window.alwaysOnTop', event.target.checked);
              }}
            />
          </label>
          <label className="settings-field">
            <span>背景透明度</span>
            <div className="settings-range">
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={windowBackgroundOpacity}
                onChange={(event) => {
                  void applyConfigValue('window.backgroundOpacity', Number(event.target.value));
                }}
              />
              <strong>{windowBackgroundOpacity.toFixed(2)}</strong>
            </div>
          </label>
          <label className="settings-field">
            <span>交互透明度</span>
            <div className="settings-range">
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={windowInteractionOpacity}
                onChange={(event) => {
                  void applyConfigValue('window.interactionOpacity', Number(event.target.value));
                }}
              />
              <strong>{windowInteractionOpacity.toFixed(2)}</strong>
            </div>
          </label>
          <label className="settings-field settings-field--inline">
            <span>任务栏显示</span>
            <input
              type="checkbox"
              checked={!windowSkipTaskbar}
              onChange={(event) => {
                void applyConfigValue('window.skipTaskbar', !event.target.checked);
              }}
            />
          </label>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => {
              void handleResetWindowPosition();
            }}
          >
            重置窗口位置
          </button>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <h3>显示</h3>
            <span className="device-pill">{resolvedTheme === 'dark' ? '深色' : '浅色'}</span>
          </div>
          <label className="settings-field">
            <span>主题模式</span>
            <select
              value={appearanceTheme}
              onChange={(event) => {
                void applyConfigValue('appearance.theme', event.target.value);
              }}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="settings-field">
            <span>基础字号</span>
            <div className="settings-range">
              <input
                type="range"
                min="12"
                max="24"
                step="1"
                value={appearanceFontSize}
                onChange={(event) => {
                  void applyConfigValue('appearance.fontSize', Number(event.target.value));
                }}
              />
              <strong>{appearanceFontSize}px</strong>
            </div>
          </label>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <h3>设备</h3>
            <span className="device-pill">{devices.length} 台</span>
          </div>
          <label className="settings-field settings-field--inline">
            <span>自动同步</span>
            <input
              type="checkbox"
              checked={deviceAutoRefresh}
              onChange={(event) => {
                void applyConfigValue('devices.autoRefresh', event.target.checked);
              }}
            />
          </label>
          <label className="settings-field">
            <span>自动同步间隔</span>
            <div className="settings-range">
              <input
                type="range"
                min="30"
                max="1800"
                step="30"
                value={deviceRefreshInterval}
                onChange={(event) => {
                  void applyConfigValue('devices.refreshInterval', Number(event.target.value));
                }}
              />
              <strong>{deviceRefreshInterval}s</strong>
            </div>
          </label>
          <div className="settings-note">
            <strong>上次同步</strong>
            <span>{formatDateTime(lastSyncedAt ?? config?.devices.lastSyncAt)}</span>
          </div>
          <div className="settings-note">
            <strong>认证区域</strong>
            <span>{resolveRegion(session?.region ?? config?.miHome.region).toUpperCase()}</span>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section__header">
            <h3>操作</h3>
            <span className="device-pill">{session?.status === 'success' ? '已登录' : '未登录'}</span>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => {
                void handleLogout();
              }}
              disabled={session?.status !== 'success'}
            >
              退出登录            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => {
                void handleQuitApp();
              }}
              disabled={isQuittingApp}
            >
              {isQuittingApp ? '退出中...' : '退出程序'}
            </button>
          </div>
        </section>
      </aside>
    </main>
  );
}


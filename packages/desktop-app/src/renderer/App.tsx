import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { LogOut, Pin, RefreshCw, ScanLine, Settings, Star, UserRound } from 'lucide-react';
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
const ENVIRONMENT_DEVICE_STATUS_REFRESH_INTERVAL_MS = 20000;
const ALL_ROOMS_TAB_ID = '__all_rooms__';
const FAVORITES_TAB_ID = '__favorite_rooms__';
const ALL_ROOMS_LABEL = '全部';
const FAVORITES_LABEL = '我的关注';

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
  setModeAuto: '切换自动中',
  setModeSleep: '切换睡眠中',
  setModeFavorite: '切换最爱中',
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
  key: 'boot' | 'session' | 'device' | 'settings';
  tone: 'danger' | 'warning';
  message: string;
}

interface RoomTab {
  id: string;
  label: string;
  kind: 'all' | 'favorites' | 'room';
  roomName?: string;
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
  return (device.capability.supportedActions?.length ?? 0) > 0;
}

function supportsDeviceAction(
  device: MiHomeDeviceSummary,
  action: Exclude<DeviceControlAction, 'refresh'>,
): boolean {
  return device.capability.supportedActions?.includes(action) ?? false;
}

function isAirPurifierDevice(device: MiHomeDeviceSummary, status?: DeviceStatusSnapshot): boolean {
  return status?.deviceClass === 'airPurifier' || device.model.startsWith('zhimi.air');
}

function isSocketDevice(device: MiHomeDeviceSummary, status?: DeviceStatusSnapshot): boolean {
  return status?.deviceClass === 'socket' || getDeviceTone(device) === 'socket';
}

function isAirConditionerSocket(device: MiHomeDeviceSummary): boolean {
  const searchText = getDeviceSearchText(device);
  return searchText.includes('空调');
}

function shouldShowSocketPower(device: MiHomeDeviceSummary, status?: DeviceStatusSnapshot): boolean {
  return (
    isSocketDevice(device, status) &&
    !isAirConditionerSocket(device) &&
    status?.power === true &&
    typeof status.currentPowerW === 'number'
  );
}

function formatSocketPower(powerW?: number): string | null {
  if (typeof powerW !== 'number' || Number.isNaN(powerW)) {
    return null;
  }

  if (powerW >= 100) {
    return `${Math.round(powerW)}W`;
  }

  if (powerW >= 10) {
    return `${powerW.toFixed(1)}W`;
  }

  return `${powerW.toFixed(2)}W`;
}

function getSocketPowerTone(powerW?: number): 'low' | 'medium' | 'high' | null {
  if (typeof powerW !== 'number' || Number.isNaN(powerW)) {
    return null;
  }

  if (powerW < 200) {
    return 'low';
  }

  if (powerW < 1400) {
    return 'medium';
  }

  return 'high';
}

function getDeviceStatusRefreshIntervalMs(
  device: MiHomeDeviceSummary,
  status?: DeviceStatusSnapshot,
): number | null {
  if (isAirPurifierDevice(device, status)) {
    return ENVIRONMENT_DEVICE_STATUS_REFRESH_INTERVAL_MS;
  }

  if (shouldShowSocketPower(device, status)) {
    return ENVIRONMENT_DEVICE_STATUS_REFRESH_INTERVAL_MS;
  }

  return null;
}

function getAirPurifierModeLabel(mode?: DeviceStatusSnapshot['mode']): string {
  switch (mode) {
    case 'auto':
      return '自动';
    case 'sleep':
      return '睡眠';
    case 'favorite':
      return '最爱';
    default:
      return '--';
  }
}

function buildRoomTabs(devices: MiHomeDeviceSummary[]): RoomTab[] {
  const roomNames = new Set<string>();

  for (const device of devices) {
    if (device.roomName?.trim()) {
      roomNames.add(device.roomName.trim());
    }
  }

  return [
    { id: ALL_ROOMS_TAB_ID, label: ALL_ROOMS_LABEL, kind: 'all' },
    { id: FAVORITES_TAB_ID, label: FAVORITES_LABEL, kind: 'favorites' },
    ...Array.from(roomNames)
      .sort((left, right) => left.localeCompare(right, 'zh-CN'))
      .map((roomName) => ({
        id: `room:${roomName}`,
        label: roomName,
        kind: 'room' as const,
        roomName,
      })),
  ];
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

  if (isAirPurifierDevice(device)) {
    return 1;
  }

  if (canControlDevice(device)) {
    return 2;
  }

  return 3;
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

  if (isAirPurifierDevice(device, status) && status?.mode) {
    return `${getAirPurifierModeLabel(status.mode)}模式`;
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
  const [selectedRoomTabId, setSelectedRoomTabId] = useState<string>(FAVORITES_TAB_ID);
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatusSnapshot>>({});
  const [deviceBusyMap, setDeviceBusyMap] = useState<Record<string, DeviceControlAction | 'refresh' | null>>({});
  const [deviceFeedbackMap, setDeviceFeedbackMap] = useState<Record<string, string>>({});
  const [deviceFeedbackToneMap, setDeviceFeedbackToneMap] = useState<Record<string, 'neutral' | 'success' | 'danger'>>(
    {},
  );
  const [deviceIconErrorMap, setDeviceIconErrorMap] = useState<Record<string, boolean>>({});
  const [favoriteBusyMap, setFavoriteBusyMap] = useState<Record<string, boolean>>({});

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
  const deviceStatusRefreshTimerRef = useRef<number | null>(null);
  const deviceBusyMapRef = useRef<Record<string, DeviceControlAction | 'refresh' | null>>({});
  const deviceStatusesRef = useRef<Record<string, DeviceStatusSnapshot>>({});
  const lastDeviceStatusRefreshAtRef = useRef<Record<string, number>>({});
  const deviceStatusRefreshBusyRef = useRef<boolean>(false);
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
      clearDeviceStatusRefreshTimer();
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
  const selectedRoomTab = useMemo(
    () => roomTabs.find((roomTab) => roomTab.id === selectedRoomTabId) ?? roomTabs[0],
    [roomTabs, selectedRoomTabId],
  );

  useEffect(() => {
    if (!roomTabs.some((roomTab) => roomTab.id === selectedRoomTabId)) {
      setSelectedRoomTabId(FAVORITES_TAB_ID);
    }
  }, [roomTabs, selectedRoomTabId]);

  useEffect(() => {
    setDeviceIconErrorMap({});
  }, [devices]);

  useEffect(() => {
    deviceBusyMapRef.current = deviceBusyMap;
  }, [deviceBusyMap]);

  useEffect(() => {
    deviceStatusesRef.current = deviceStatuses;
  }, [deviceStatuses]);

  const visibleDevices = useMemo(() => {
    let filtered = devices;

    if (selectedRoomTab?.kind === 'favorites') {
      filtered = devices.filter((device) => device.isFavorite === true);
    } else if (selectedRoomTab?.kind === 'room' && selectedRoomTab.roomName) {
      filtered = devices.filter((device) => (device.roomName ?? '未分配房间') === selectedRoomTab.roomName);
    }

    return sortDashboardDevices(filtered);
  }, [devices, selectedRoomTab]);

  const emptyStateTitle = selectedRoomTab?.kind === 'favorites' ? '我的关注里还没有设备' : '当前筛选房间还没有设备';
  const emptyStateDescription =
    selectedRoomTab?.kind === 'favorites'
      ? '点击设备图标右侧的星标，就可以把设备加入这里。'
      : '切换房间标签，或者点击右上角同步按钮刷新设备列表。';

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
    clearDeviceStatusRefreshTimer();

    if (session?.status !== 'success') {
      return;
    }

    const refreshIntervals = visibleDevices
      .map((device) => getDeviceStatusRefreshIntervalMs(device, deviceStatusesRef.current[device.id]))
      .filter((value): value is number => value !== null);

    if (refreshIntervals.length === 0) {
      return;
    }

    const tickMs = Math.min(...refreshIntervals);
    deviceStatusRefreshTimerRef.current = window.setInterval(() => {
      void refreshVisibleDevicesByPolicy();
    }, tickMs);

    return () => {
      clearDeviceStatusRefreshTimer();
    };
  }, [session?.status, visibleDevices]);

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
            lastDeviceStatusRefreshAtRef.current[result.value.deviceId] = Date.now();
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

  function handleDismissAlert(alertKey: FloatingAlertMessage['key']) {
    switch (alertKey) {
      case 'boot':
        setBootError(null);
        break;
      case 'session':
        setSessionError(null);
        break;
      case 'device':
        setDeviceError(null);
        break;
      case 'settings':
        setSettingsError(null);
        break;
      default:
        break;
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
      lastDeviceStatusRefreshAtRef.current[deviceId] = Date.now();
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
    await handleControlDeviceAction(deviceId, action);
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

  async function handleToggleFavorite(device: MiHomeDeviceSummary) {
    if (favoriteBusyMap[device.id]) {
      return;
    }

    setFavoriteBusyMap((current) => ({
      ...current,
      [device.id]: true,
    }));
    setDeviceError(null);

    try {
      const updatedDevices = await window.mijia.device.setFavorite(device.id, device.isFavorite !== true);
      if (!isMountedRef.current) {
        return;
      }

      setDevices(sortDashboardDevices(updatedDevices));
    } catch (favoriteError) {
      if (!isMountedRef.current) {
        return;
      }

      setDeviceError(normalizeErrorMessage(favoriteError));
    } finally {
      if (isMountedRef.current) {
        setFavoriteBusyMap((current) => ({
          ...current,
          [device.id]: false,
        }));
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

  async function handleAirPurifierModeChange(
    deviceId: string,
    action: 'setModeAuto' | 'setModeSleep' | 'setModeFavorite',
  ) {
    await handleControlDeviceAction(deviceId, action);
  }

  async function handleControlDeviceAction(
    deviceId: string,
    action: Exclude<DeviceControlAction, 'refresh' | 'toggle'>,
  ) {
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
        lastDeviceStatusRefreshAtRef.current[deviceId] = Date.now();
      }

      setDeviceFeedback(
        deviceId,
        result.message ?? (result.success ? '控制成功' : '控制失败'),
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

  function resetDeviceRuntimeState() {
    setDeviceStatuses({});
    setDeviceBusyMap({});
    setDeviceFeedbackMap({});
    setDeviceFeedbackToneMap({});
    setFavoriteBusyMap({});
    deviceStatusesRef.current = {};
    lastDeviceStatusRefreshAtRef.current = {};
  }

  function renderDeviceLeading(
    device: MiHomeDeviceSummary,
    tone: DeviceTone,
    glyph: string,
    iconUrl?: string,
  ) {
    const isFavorite = device.isFavorite === true;
    const isFavoriteBusy = favoriteBusyMap[device.id] === true;
    const favoriteActionLabel = isFavorite ? '移出我的关注' : '加入我的关注';

    return (
      <div className="device-card__leading">
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

        <button
          type="button"
          className={`device-favorite-button${isFavorite ? ' device-favorite-button--active' : ''}${
            isFavoriteBusy ? ' device-favorite-button--busy' : ''
          }`}
          onClick={() => {
            void handleToggleFavorite(device);
          }}
          disabled={isFavoriteBusy}
          title={favoriteActionLabel}
          aria-label={favoriteActionLabel}
        >
          <Star
            className={`device-favorite-button__icon${isFavorite ? ' device-favorite-button__icon--filled' : ''}`}
            strokeWidth={2.2}
          />
        </button>
      </div>
    );
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

  function clearDeviceStatusRefreshTimer() {
    if (deviceStatusRefreshTimerRef.current !== null) {
      window.clearInterval(deviceStatusRefreshTimerRef.current);
      deviceStatusRefreshTimerRef.current = null;
    }
  }

  async function refreshVisibleDevicesByPolicy() {
    if (deviceStatusRefreshBusyRef.current) {
      return;
    }

    deviceStatusRefreshBusyRef.current = true;

    const now = Date.now();
    const targets = visibleDevices.filter((device) => {
      const refreshInterval = getDeviceStatusRefreshIntervalMs(device, deviceStatusesRef.current[device.id]);
      if (refreshInterval === null) {
        return false;
      }

      if (deviceBusyMapRef.current[device.id] != null) {
        return false;
      }

      const lastRefreshedAt = lastDeviceStatusRefreshAtRef.current[device.id] ?? 0;
      return now - lastRefreshedAt >= refreshInterval;
    });

    if (targets.length === 0) {
      deviceStatusRefreshBusyRef.current = false;
      return;
    }

    try {
      const results = await Promise.allSettled(
        targets.map(async (device) => ({
          deviceId: device.id,
          snapshot: await window.mijia.device.getStatus(device.id),
        })),
      );

      if (!isMountedRef.current) {
        return;
      }

      setDeviceStatuses((current) => {
        const next = { ...current };

        for (const result of results) {
          if (result.status === 'fulfilled') {
            next[result.value.deviceId] = result.value.snapshot;
            lastDeviceStatusRefreshAtRef.current[result.value.deviceId] = Date.now();
          }
        }

        return next;
      });
    } finally {
      deviceStatusRefreshBusyRef.current = false;
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
              <div className="floating-alert__message">{alert.message}</div>
              <button
                type="button"
                className="floating-alert__close"
                onClick={() => {
                  handleDismissAlert(alert.key);
                }}
                aria-label="关闭提示"
                title="关闭提示"
              >
                ×
              </button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="sticky-window">
        {isLoggedIn ? (
          <>
            <header className="sticky-window__header">
              <div className="room-tabs" role="tablist" aria-label="房间切换">
                {roomTabs.map((roomTab) => (
                  <button
                    key={roomTab.id}
                    type="button"
                    className={`room-tab${selectedRoomTabId === roomTab.id ? ' room-tab--active' : ''}`}
                    onClick={() => {
                      setSelectedRoomTabId(roomTab.id);
                    }}
                  >
                    {roomTab.label}
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
                  const isAirPurifier = isAirPurifierDevice(device, status);
                  const showSocketPower = shouldShowSocketPower(device, status);
                  const socketPowerLabel = formatSocketPower(status?.currentPowerW);
                  const socketPowerTone = getSocketPowerTone(status?.currentPowerW);
                  const roomLabel = device.roomName ?? '未分配房间';
                  const statusLabel = feedback ?? getDeviceStatusLine(device, status);
                  const isFeature = tone === 'environment' || (index === 0 && !isControllable);
                  const iconUrl = deviceIconErrorMap[device.id] ? undefined : device.iconUrl;

                  return (
                    <article
                      key={device.id}
                      className={`device-card device-card--${tone}${isFeature ? ' device-card--feature' : ''}${
                        isAirPurifier ? ' device-card--air-purifier' : ''
                      }`}
                    >
                      {isAirPurifier ? (
                        <>
                          <div className="device-card__summary">
                            <div className="device-card__top">
                              {renderDeviceLeading(device, tone, glyph, iconUrl)}

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

                            <div className="device-card__content device-card__content--compact">
                              <div>
                                <h3>{device.name}</h3>
                                <p className="device-card__meta">
                                  <span>{roomLabel}</span>
                                  <span aria-hidden="true">|</span>
                                  <span>{statusLabel}</span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="device-card__mode-group" role="group" aria-label="空气净化器模式">
                            {[
                              ['自动', 'setModeAuto'],
                              ['睡眠', 'setModeSleep'],
                              ['最爱', 'setModeFavorite'],
                            ].map(([label, action]) => {
                              const isActive =
                                (action === 'setModeAuto' && status?.mode === 'auto') ||
                                (action === 'setModeSleep' && status?.mode === 'sleep') ||
                                (action === 'setModeFavorite' && status?.mode === 'favorite');
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  className={`device-mode-chip${isActive ? ' device-mode-chip--active' : ''}`}
                                  disabled={
                                    busyAction != null ||
                                    !supportsDeviceAction(
                                      device,
                                      action as 'setModeAuto' | 'setModeSleep' | 'setModeFavorite',
                                    )
                                  }
                                  onClick={() => {
                                    void handleAirPurifierModeChange(
                                      device.id,
                                      action as 'setModeAuto' | 'setModeSleep' | 'setModeFavorite',
                                    );
                                  }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="device-card__metrics">
                            <div className="device-metric">
                              <span className="device-metric__label">温度</span>
                              <strong className="device-metric__value">
                                {typeof status?.temperature === 'number' ? `${Math.round(status.temperature)}°C` : '--'}
                              </strong>
                            </div>
                            <div className="device-metric">
                              <span className="device-metric__label">湿度</span>
                              <strong className="device-metric__value">
                                {typeof status?.humidity === 'number' ? `${status.humidity}%` : '--'}
                              </strong>
                            </div>
                            <div className="device-metric">
                              <span className="device-metric__label">空气质量</span>
                              <strong className="device-metric__value">{status?.airQualityLabel ?? '--'}</strong>
                              <span className="device-metric__subvalue">
                                {typeof status?.pm25Density === 'number' ? `PM2.5 ${status.pm25Density}` : 'PM2.5 --'}
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {showSocketPower && socketPowerLabel ? (
                            <div className="device-card__summary device-card__summary--socket">
                              <div className="device-card__top">
                                {renderDeviceLeading(device, tone, glyph, iconUrl)}

                                <div className="device-card__control-stack">
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
                              </div>

                              <div className="device-card__content device-card__content--compact">
                                <div>
                                  <div className="device-card__title-row">
                                    <h3>{device.name}</h3>
                                    <span
                                      className={`device-card__power${
                                        socketPowerTone ? ` device-card__power--${socketPowerTone}` : ''
                                      }`}
                                    >
                                      {socketPowerLabel}
                                    </span>
                                  </div>
                                  <p className="device-card__meta">
                                    <span>{roomLabel}</span>
                                    <span aria-hidden="true">|</span>
                                    <span>{statusLabel}</span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="device-card__top">
                                {renderDeviceLeading(device, tone, glyph, iconUrl)}

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
                                  <p className="device-card__meta">
                                    <span>{roomLabel}</span>
                                    <span aria-hidden="true">|</span>
                                    <span>{statusLabel}</span>
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}

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
                  <p>{emptyStateTitle}</p>
                  <span>{emptyStateDescription}</span>
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


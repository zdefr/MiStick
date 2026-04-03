export type LoginStatus = 'idle' | 'pending' | 'success' | 'expired' | 'error';
export type DeviceControlRoute = 'cloud' | 'local' | 'unavailable';
export type DeviceControlAction =
  | 'toggle'
  | 'turnOn'
  | 'turnOff'
  | 'refresh'
  | 'setModeAuto'
  | 'setModeSleep'
  | 'setModeFavorite';
export type DeviceNameSource = 'cloud' | 'alias';

export interface MiHomeQrLoginTicket {
  ticketId: string;
  qrCodeData: string;
  expiresAt: string;
}

export interface MiHomeSessionSnapshot {
  status: LoginStatus;
  accountId?: string;
  region: string;
  lastLoginAt?: string;
  message?: string;
}

export interface MiHomeHomeSummary {
  id: string;
  name: string;
}

export interface MiHomeRoomSummary {
  id: string;
  homeId: string;
  name: string;
}

export interface MiHomeDeviceCapability {
  supportsCloudControl: boolean;
  supportsLocalControl: boolean;
  preferredRoute: DeviceControlRoute;
  supportedActions: DeviceControlAction[];
  capabilityMessage?: string;
}

export interface MiHomeDeviceSummary {
  id: string;
  name: string;
  originalName: string;
  aliasName?: string;
  nameSource: DeviceNameSource;
  model: string;
  iconUrl?: string;
  homeId: string;
  roomId?: string;
  roomName?: string;
  isFavorite?: boolean;
  isOnline: boolean;
  capability: MiHomeDeviceCapability;
  cloudContext?: {
    did: string;
    siid?: number;
    piid?: number;
    aiid?: number;
  };
  localContext?: {
    host?: string;
    tokenRef?: string;
  };
}

export interface DeviceStatusSnapshot {
  deviceId: string;
  power?: boolean;
  online: boolean;
  updatedAt: string;
  route: DeviceControlRoute;
  deviceClass?: 'airPurifier' | 'socket';
  mode?: 'auto' | 'sleep' | 'favorite';
  currentPowerW?: number;
  temperature?: number;
  humidity?: number;
  airQualityCode?: number;
  airQualityLabel?: string;
  pm25Density?: number;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface DeviceCommandRequest {
  deviceId: string;
  action: DeviceControlAction;
  params?: Record<string, unknown>;
}

export interface DeviceCommandResult {
  deviceId: string;
  success: boolean;
  route: DeviceControlRoute;
  message?: string;
  updatedStatus?: DeviceStatusSnapshot;
}

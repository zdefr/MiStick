import type {
  DeviceCommandRequest,
  DeviceCommandResult,
  DeviceStatusSnapshot,
  MiHomeDeviceCapability,
} from '../../../shared/mihome/types';

export interface DeviceCapabilityPort {
  getCapability(deviceId: string): Promise<MiHomeDeviceCapability>;
}

export interface CloudControlPort {
  execute(command: DeviceCommandRequest): Promise<DeviceCommandResult>;
  getStatus(deviceId: string): Promise<DeviceStatusSnapshot>;
}

export interface LocalControlPort {
  execute(command: DeviceCommandRequest): Promise<DeviceCommandResult>;
  getStatus(deviceId: string): Promise<DeviceStatusSnapshot>;
}
import type {
  DeviceCommandRequest,
  DeviceCommandResult,
  DeviceStatusSnapshot,
} from '../../../shared/mihome/types';
import type { LocalControlPort } from './ports';

export class NoopLocalControlPort implements LocalControlPort {
  async execute(command: DeviceCommandRequest): Promise<DeviceCommandResult> {
    return {
      deviceId: command.deviceId,
      success: false,
      route: 'local',
      message: '本地控制服务尚未接入。',
    };
  }

  async getStatus(deviceId: string): Promise<DeviceStatusSnapshot> {
    return {
      deviceId,
      online: false,
      updatedAt: new Date().toISOString(),
      route: 'local',
      raw: {
        message: '本地控制服务尚未接入。',
      },
    };
  }
}

import type { MiHomeDeviceCapability } from '../../../shared/mihome/types';
import type { DeviceCachePort } from '../device-sync/ports';
import type { DeviceCapabilityPort } from './ports';

export class CachedDeviceCapabilityPort implements DeviceCapabilityPort {
  constructor(private readonly deviceCachePort: DeviceCachePort) {}

  async getCapability(deviceId: string): Promise<MiHomeDeviceCapability> {
    const devices = await this.deviceCachePort.getDevices();
    const targetDevice = devices.find((device) => device.id === deviceId);

    if (!targetDevice) {
      return {
        supportsCloudControl: false,
        supportsLocalControl: false,
        preferredRoute: 'unavailable',
        supportedActions: [],
        capabilityMessage: '未找到设备缓存，暂时无法判断控制能力。',
      };
    }

    return {
      ...targetDevice.capability,
      supportedActions: targetDevice.capability.supportedActions ?? [],
    };
  }
}

import type { DeviceCommandRequest, DeviceCommandResult, DeviceStatusSnapshot } from '../../../shared/mihome/types';
import type { CloudControlPort, DeviceCapabilityPort, LocalControlPort } from './ports';

export class DeviceControlService {
  constructor(
    private readonly capabilityPort: DeviceCapabilityPort,
    private readonly cloudControlPort: CloudControlPort,
    private readonly localControlPort: LocalControlPort,
  ) {}

  async execute(command: DeviceCommandRequest): Promise<DeviceCommandResult> {
    const capability = await this.capabilityPort.getCapability(command.deviceId);

    if (capability.preferredRoute === 'cloud' && capability.supportsCloudControl) {
      return this.cloudControlPort.execute(command);
    }

    if (capability.supportsLocalControl) {
      return this.localControlPort.execute(command);
    }

    return {
      deviceId: command.deviceId,
      success: false,
      route: 'unavailable',
      message: 'Device does not expose a supported control route yet.',
    };
  }

  async getStatus(deviceId: string): Promise<DeviceStatusSnapshot> {
    const capability = await this.capabilityPort.getCapability(deviceId);

    if (capability.preferredRoute === 'cloud' && capability.supportsCloudControl) {
      return this.cloudControlPort.getStatus(deviceId);
    }

    if (capability.supportsLocalControl) {
      return this.localControlPort.getStatus(deviceId);
    }

    return {
      deviceId,
      online: false,
      updatedAt: new Date().toISOString(),
      route: 'unavailable',
    };
  }
}
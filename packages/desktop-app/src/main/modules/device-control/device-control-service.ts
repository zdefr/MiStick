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
      try {
        return await this.cloudControlPort.execute(command);
      } catch (error) {
        if (capability.supportsLocalControl) {
          return this.localControlPort.execute(command);
        }

        return {
          deviceId: command.deviceId,
          success: false,
          route: 'cloud',
          message: error instanceof Error ? error.message : String(error),
        };
      }
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
      try {
        return await this.cloudControlPort.getStatus(deviceId);
      } catch (error) {
        if (capability.supportsLocalControl) {
          return this.localControlPort.getStatus(deviceId);
        }

        return {
          deviceId,
          online: false,
          updatedAt: new Date().toISOString(),
          route: 'cloud',
          raw: {
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
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

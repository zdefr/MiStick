import type {
  DeviceCommandRequest,
  DeviceCommandResult,
  DeviceStatusSnapshot,
} from '../../../shared/mihome/types';
import type { CloudControlPort } from './ports';

interface BridgeClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

export class HttpCloudControlPort implements CloudControlPort {
  constructor(private readonly options: BridgeClientOptions) {}

  async execute(command: DeviceCommandRequest): Promise<DeviceCommandResult> {
    return this.postJson<DeviceCommandResult>('/api/cloud/control', {
      deviceId: command.deviceId,
      action: command.action,
    });
  }

  async getStatus(deviceId: string): Promise<DeviceStatusSnapshot> {
    return this.getJson<DeviceStatusSnapshot>(
      `/api/cloud/status?deviceId=${encodeURIComponent(deviceId)}`,
    );
  }

  private async getJson<T>(pathname: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}${pathname}`, {
        signal: controller.signal,
      });
      return this.readJson<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async postJson<T>(pathname: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}${pathname}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return this.readJson<T>(response);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }
}

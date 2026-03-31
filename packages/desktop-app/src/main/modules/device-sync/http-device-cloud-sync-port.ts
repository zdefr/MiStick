import type {
  MiHomeDeviceSummary,
  MiHomeHomeSummary,
  MiHomeRoomSummary,
} from '../../../shared/mihome/types';
import type { DeviceCloudSyncPort } from './ports';

interface BridgeClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

interface BridgeRoomDto {
  id: string;
  homeId: string;
  name: string;
}

interface BridgeDeviceDto {
  did: string;
  name: string;
  model: string;
  iconUrl?: string;
  homeId: string;
  roomId?: string;
  roomName?: string;
  online?: boolean;
  specType?: string;
  supportsCloudControl?: boolean;
  supportedActions?: Array<'toggle' | 'turnOn' | 'turnOff'>;
  capabilityMessage?: string;
}

export class HttpDeviceCloudSyncPort implements DeviceCloudSyncPort {
  constructor(private readonly options: BridgeClientOptions) {}

  async getHomes(): Promise<MiHomeHomeSummary[]> {
    const homes = await this.getJson<Array<{ id: string; name: string }>>('/api/cloud/homes');
    return homes.map((home) => ({ id: home.id, name: home.name }));
  }

  async getRooms(homeId: string): Promise<MiHomeRoomSummary[]> {
    const rooms = await this.getJson<BridgeRoomDto[]>(
      `/api/cloud/rooms?homeId=${encodeURIComponent(homeId)}`,
      this.getSyncTimeoutMs(),
    );
    return rooms.map((room) => ({
      id: room.id,
      homeId: room.homeId,
      name: room.name,
    }));
  }

  async getDevices(homeId: string): Promise<MiHomeDeviceSummary[]> {
    const rooms = await this.getRooms(homeId);
    const roomMap = new Map(rooms.map((room) => [room.id, room.name]));
    const devices = await this.getJson<BridgeDeviceDto[]>(
      `/api/cloud/devices?homeId=${encodeURIComponent(homeId)}`,
      this.getSyncTimeoutMs(),
    );

    return devices.map((device) => {
      const supportsCloudControl = device.supportsCloudControl ?? false;
      const summary: MiHomeDeviceSummary = {
        id: device.did,
        name: device.name,
        originalName: device.name,
        nameSource: 'cloud',
        model: device.model,
        homeId: device.homeId,
        isOnline: device.online ?? false,
        capability: {
          supportsCloudControl,
          supportsLocalControl: false,
          preferredRoute: supportsCloudControl ? 'cloud' : 'unavailable',
          supportedActions: device.supportedActions ?? [],
        },
        cloudContext: {
          did: device.did,
        },
      };

      if (device.capabilityMessage) {
        summary.capability.capabilityMessage = device.capabilityMessage;
      }

      if (device.iconUrl) {
        summary.iconUrl = device.iconUrl;
      }

      if (device.roomId) {
        summary.roomId = device.roomId;
        const roomName = device.roomName ?? roomMap.get(device.roomId);
        if (roomName) {
          summary.roomName = roomName;
        }
      }

      return summary;
    });
  }

  private getSyncTimeoutMs(): number {
    return Math.max(this.options.timeoutMs, 60000);
  }

  private async getJson<T>(url: string, timeoutMs = this.options.timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}${url}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

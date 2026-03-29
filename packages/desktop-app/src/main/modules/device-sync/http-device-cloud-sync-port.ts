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
  homeId: string;
  roomId?: string;
  roomName?: string;
  online?: boolean;
  specType?: string;
}

export class HttpDeviceCloudSyncPort implements DeviceCloudSyncPort {
  constructor(private readonly options: BridgeClientOptions) {}

  async getHomes(): Promise<MiHomeHomeSummary[]> {
    const homes = await this.getJson<Array<{ id: string; name: string }>>('/api/cloud/homes');
    return homes.map((home) => ({ id: home.id, name: home.name }));
  }

  async getRooms(homeId: string): Promise<MiHomeRoomSummary[]> {
    const rooms = await this.getJson<BridgeRoomDto[]>(`/api/cloud/rooms?homeId=${encodeURIComponent(homeId)}`);
    return rooms.map((room) => ({
      id: room.id,
      homeId: room.homeId,
      name: room.name,
    }));
  }

  async getDevices(homeId: string): Promise<MiHomeDeviceSummary[]> {
    const rooms = await this.getRooms(homeId);
    const roomMap = new Map(rooms.map((room) => [room.id, room.name]));
    const devices = await this.getJson<BridgeDeviceDto[]>(`/api/cloud/devices?homeId=${encodeURIComponent(homeId)}`);

    return devices.map((device) => {
      const supportsCloudControl = inferCloudControlCapability(device);
      const summary: MiHomeDeviceSummary = {
        id: device.did,
        name: device.name,
        model: device.model,
        homeId: device.homeId,
        isOnline: device.online ?? false,
        capability: {
          supportsCloudControl,
          supportsLocalControl: false,
          preferredRoute: supportsCloudControl ? 'cloud' : 'unavailable',
        },
        cloudContext: {
          did: device.did,
        },
      };

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

  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

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

function inferCloudControlCapability(device: BridgeDeviceDto): boolean {
  const fingerprint = `${device.model} ${device.specType ?? ''}`.toLowerCase();
  console.log(device)
  const controllableKeywords = [
    'outlet',
    'plug',
    'switch',
    'light',
    'lamp',
    'night-light',
  ];

  return controllableKeywords.some((keyword) => fingerprint.includes(keyword));
}

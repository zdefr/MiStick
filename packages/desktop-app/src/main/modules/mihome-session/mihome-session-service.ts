import type { MiHomeQrLoginTicket, MiHomeSessionSnapshot } from '../../../shared/mihome/types';
import type { MiHomeBridgeAuthPort, MiHomeSessionConfigPort } from './ports';

export class MiHomeSessionService {
  constructor(
    private readonly bridgeAuthPort: MiHomeBridgeAuthPort,
    private readonly configPort: MiHomeSessionConfigPort,
  ) {}

  async startQrLogin(region?: string): Promise<MiHomeQrLoginTicket> {
    const resolvedRegion = region ?? (await this.configPort.getRegion());
    return this.bridgeAuthPort.startQrLogin(resolvedRegion);
  }

  async pollQrLogin(ticketId: string): Promise<MiHomeSessionSnapshot> {
    const snapshot = await this.bridgeAuthPort.pollQrLogin(ticketId);

    if (snapshot.status === 'success') {
      await this.configPort.setSessionSnapshot(snapshot);
    }

    return snapshot;
  }

  async getSession(): Promise<MiHomeSessionSnapshot> {
    return this.bridgeAuthPort.getSession();
  }

  async logout(): Promise<MiHomeSessionSnapshot> {
    await this.bridgeAuthPort.logout();
    await this.configPort.clearSession();

    const region = await this.configPort.getRegion();
    return { status: 'idle', region };
  }
}
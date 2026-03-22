import type { MiHomeQrLoginTicket, MiHomeSessionSnapshot } from '../../../shared/mihome/types';

export interface MiHomeBridgeAuthPort {
  startQrLogin(region: string): Promise<MiHomeQrLoginTicket>;
  pollQrLogin(ticketId: string): Promise<MiHomeSessionSnapshot>;
  getSession(): Promise<MiHomeSessionSnapshot>;
  logout(): Promise<void>;
}

export interface MiHomeSessionConfigPort {
  getRegion(): Promise<string>;
  getAccountId(): Promise<string | undefined>;
  setSessionSnapshot(snapshot: MiHomeSessionSnapshot): Promise<void>;
  clearSession(): Promise<void>;
}
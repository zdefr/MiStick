import type { ConfigService } from '../config';
import type { MiHomeSessionSnapshot } from '../../../shared/mihome/types';
import type { MiHomeSessionConfigPort } from './ports';

export class ConfigSessionPort implements MiHomeSessionConfigPort {
  constructor(private readonly configService: ConfigService) {}

  async getRegion(): Promise<string> {
    return this.configService.getByPath<string>('miHome.region');
  }

  async getAccountId(): Promise<string | undefined> {
    const currentMiHome = await this.configService.getByPath<Record<string, unknown>>('miHome');
    const accountId = currentMiHome.accountId;
    return typeof accountId === 'string' && accountId !== '' ? accountId : undefined;
  }

  async setSessionSnapshot(snapshot: MiHomeSessionSnapshot): Promise<void> {
    const currentMiHome = await this.configService.getByPath<Record<string, unknown>>('miHome');
    await this.configService.setByPath('miHome', {
      ...currentMiHome,
      accountId: snapshot.accountId,
      region: snapshot.region,
      lastLoginAt: normalizeDateTime(snapshot.lastLoginAt) ?? new Date().toISOString(),
    });
  }

  async clearSession(): Promise<void> {
    const currentMiHome = await this.configService.getByPath<Record<string, unknown>>('miHome');
    const { accountId: _accountId, lastLoginAt: _lastLoginAt, token: _token, ...rest } = currentMiHome;
    await this.configService.setByPath('miHome', rest);
  }
}

function normalizeDateTime(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

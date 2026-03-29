import type { MiHomeQrLoginTicket, MiHomeSessionSnapshot } from '../../../shared/mihome/types';
import type { MiHomeBridgeAuthPort } from './ports';

interface BridgeClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

interface LoginPollResponse {
  ticketId: string;
  status: 'pending' | 'success' | 'expired' | 'failed';
  expiresAt: string;
  session?: {
    status: 'idle' | 'pending' | 'success' | 'expired' | 'failed';
    accountId?: string;
    region: 'cn' | 'de' | 'us';
    lastLoginAt?: string;
    message?: string;
  };
  errorMessage?: string;
}

interface SessionSnapshotInput {
  status: 'idle' | 'pending' | 'success' | 'expired' | 'failed';
  region: 'cn' | 'de' | 'us';
  accountId?: string;
  lastLoginAt?: string;
  message?: string;
}

export class HttpMiHomeBridgeAuthPort implements MiHomeBridgeAuthPort {
  constructor(private readonly options: BridgeClientOptions) {}

  async startQrLogin(region: string): Promise<MiHomeQrLoginTicket> {
    return this.postJson<MiHomeQrLoginTicket>('/api/auth/login/start', { region });
  }

  async pollQrLogin(ticketId: string): Promise<MiHomeSessionSnapshot> {
    const response = await this.postJson<LoginPollResponse>('/api/auth/login/poll', { ticketId });
    const snapshotInput: SessionSnapshotInput = {
      status: response.status,
      region: response.session?.region ?? 'cn',
    };

    if (response.session?.accountId) {
      snapshotInput.accountId = response.session.accountId;
    }
    if (response.session?.lastLoginAt) {
      snapshotInput.lastLoginAt = response.session.lastLoginAt;
    }
    const message = response.errorMessage ?? response.session?.message;
    if (message) {
      snapshotInput.message = message;
    }

    return this.toSessionSnapshot(snapshotInput);
  }

  async getSession(): Promise<MiHomeSessionSnapshot> {
    const response = await this.getJson<SessionSnapshotInput>('/api/auth/session');
    return this.toSessionSnapshot(response);
  }

  async logout(): Promise<void> {
    await this.postJson('/api/auth/logout', {});
  }

  private toSessionSnapshot(input: SessionSnapshotInput): MiHomeSessionSnapshot {
    const snapshot: MiHomeSessionSnapshot = {
      status: input.status === 'failed' ? 'error' : input.status,
      region: input.region,
    };

    if (input.accountId) {
      snapshot.accountId = input.accountId;
    }
    if (input.lastLoginAt) {
      snapshot.lastLoginAt = input.lastLoginAt;
    }
    if (input.message) {
      snapshot.message = input.message;
    }

    return snapshot;
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

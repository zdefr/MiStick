import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class LegacyTokenCryptoService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly keyPath: string) {}

  async encryptLegacyToken(plainText: string): Promise<string> {
    const key = await this.getOrCreateKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  async decryptLegacyToken(cipherText: string): Promise<string> {
    const key = await this.getOrCreateKey();
    const payload = Buffer.from(cipherText, 'base64');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private async getOrCreateKey(): Promise<Buffer> {
    await fs.mkdir(path.dirname(this.keyPath), { recursive: true });

    try {
      const raw = await fs.readFile(this.keyPath, 'utf8');
      return Buffer.from(raw, 'base64');
    } catch {
      const key = crypto.randomBytes(32);
      await fs.writeFile(this.keyPath, key.toString('base64'), 'utf8');
      return key;
    }
  }
}

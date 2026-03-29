import path from 'node:path';
import { ZodError } from 'zod';
import { createDefaultAppConfig } from '../../../shared/config/defaults';
import { appConfigSchema } from '../../../shared/config/schema';
import type { AppConfig, AppConfigPatch } from '../../../shared/config/types';
import { ConfigFileRepository } from './config-file-repository';
import { ensureOwnerWritableOnly } from './file-permission';
import { LegacyTokenCryptoService } from './legacy-token-crypto-service';
import { getValueByPath, mergeConfig, setValueByPath } from './path-utils';

export class ConfigService {
  private readonly configPath: string;
  private readonly repository: ConfigFileRepository;
  private readonly cryptoService: LegacyTokenCryptoService;
  private config: AppConfig | null = null;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly userDataDir: string) {
    this.configPath = path.join(userDataDir, 'config.json');
    this.repository = new ConfigFileRepository(
      this.configPath,
      path.join(userDataDir, 'backups'),
    );
    this.cryptoService = new LegacyTokenCryptoService(
      path.join(userDataDir, 'legacy-token.key'),
    );
  }

  async load(): Promise<AppConfig> {
    if (!(await this.repository.exists())) {
      const defaultConfig = createDefaultAppConfig(this.userDataDir);
      await this.persist(defaultConfig, false);
      this.config = defaultConfig;
      return defaultConfig;
    }

    try {
      const config = await this.readAndValidate(await this.repository.read());
      this.config = config;
      return config;
    } catch (error) {
      console.warn('Failed to load config.json, attempting recovery from backup.', error);
      const recoveredConfig = await this.recoverFromBackup();
      this.config = recoveredConfig;
      return recoveredConfig;
    }
  }

  async save(patch: AppConfigPatch = {}): Promise<AppConfig> {
    const base = this.config ?? (await this.load());
    const merged = mergeConfig(base, patch);
    merged.updatedAt = new Date().toISOString();
    const validated = this.validate(merged);
    await this.persist(validated, true);
    this.config = validated;
    return validated;
  }

  async getByPath<T>(key: string): Promise<T> {
    const current = this.config ?? (await this.load());
    return getValueByPath<T>(current, key);
  }

  async setByPath<T>(key: string, value: T): Promise<AppConfig> {
    const current = this.config ?? (await this.load());
    const nextConfig = setValueByPath(current, key, value);
    return this.save(nextConfig);
  }

  private async readAndValidate(raw: string): Promise<AppConfig> {
    if (raw.trim() === '') {
      throw new Error('Config file is empty');
    }

    const parsed = JSON.parse(raw) as AppConfig;

    if (parsed.miHome.token) {
      parsed.miHome.token = await this.cryptoService.decryptLegacyToken(parsed.miHome.token);
    }

    return this.validate(parsed);
  }

  private async recoverFromBackup(): Promise<AppConfig> {
    const backupPaths = await this.repository.listBackups();

    for (const backupPath of backupPaths) {
      try {
        const recoveredConfig = await this.readAndValidate(await this.repository.readBackup(backupPath));
        await this.persist(recoveredConfig, false);
        return recoveredConfig;
      } catch (error) {
        console.warn(`Failed to recover config from backup: ${backupPath}`, error);
      }
    }

    const defaultConfig = createDefaultAppConfig(this.userDataDir);
    await this.persist(defaultConfig, false);
    return defaultConfig;
  }

  private validate(input: AppConfig): AppConfig {
    try {
      return appConfigSchema.parse(input) as AppConfig;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(`Config validation failed: ${error.message}`);
      }

      throw error;
    }
  }

  private async persist(config: AppConfig, withBackup: boolean): Promise<void> {
    const writeTask = async () => {
      const toSave = structuredClone(config);
      if (toSave.miHome.token) {
        toSave.miHome.token = await this.cryptoService.encryptLegacyToken(toSave.miHome.token);
      }

      if (withBackup) {
        await this.repository.backup();
      }

      await this.repository.write(`${JSON.stringify(toSave, null, 2)}\n`);
      await ensureOwnerWritableOnly(this.configPath);
    };

    this.persistQueue = this.persistQueue.then(writeTask, writeTask);
    await this.persistQueue;
  }
}
import fs from 'node:fs/promises';
import path from 'node:path';

export class ConfigFileRepository {
  constructor(
    private readonly configPath: string,
    private readonly backupDir: string,
  ) {}

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<string> {
    return fs.readFile(this.configPath, 'utf8');
  }

  async write(content: string): Promise<void> {
    await this.ensureParentDir();
    const tempPath = `${this.configPath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, this.configPath);
  }

  async backup(): Promise<string | null> {
    if (!(await this.exists())) {
      return null;
    }

    await fs.mkdir(this.backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(':', '-');
    const backupPath = path.join(this.backupDir, `config.${timestamp}.json`);
    await fs.copyFile(this.configPath, backupPath);
    return backupPath;
  }

  async listBackups(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backupFiles = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            const fullPath = path.join(this.backupDir, entry.name);
            const stat = await fs.stat(fullPath);
            return {
              fullPath,
              modifiedAt: stat.mtimeMs,
            };
          }),
      );

      return backupFiles
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
        .map((entry) => entry.fullPath);
    } catch {
      return [];
    }
  }

  async readBackup(backupPath: string): Promise<string> {
    return fs.readFile(backupPath, 'utf8');
  }

  private async ensureParentDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
  }
}
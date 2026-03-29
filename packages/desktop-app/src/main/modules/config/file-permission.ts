import fs from 'node:fs/promises';

export async function ensureOwnerWritableOnly(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }

  await fs.chmod(filePath, 0o600);
}

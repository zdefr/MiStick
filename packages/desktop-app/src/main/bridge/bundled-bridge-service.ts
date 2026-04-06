import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { type Readable } from 'node:stream';
import { spawn, type ChildProcessByStdio } from 'node:child_process';

export interface BridgeClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

const startupTimeoutMs = 30_000;
const healthcheckIntervalMs = 400;
const logBufferLimit = 8_000;

type BridgeChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export class BundledBridgeService {
  private childProcess: BridgeChildProcess | undefined;
  private clientOptions: BridgeClientOptions | undefined;
  private startupPromise: Promise<BridgeClientOptions> | undefined;
  private readonly runtimeDir: string;
  private readonly bridgeExecutablePath: string;

  constructor(private readonly userDataDir: string) {
    this.runtimeDir = path.join(userDataDir, 'bridge-runtime');
    this.bridgeExecutablePath = resolveBridgeExecutablePath();
  }

  async ensureStarted(timeoutMs: number): Promise<BridgeClientOptions> {
    if (this.clientOptions) {
      return this.clientOptions;
    }

    if (!this.startupPromise) {
      this.startupPromise = this.start(timeoutMs);
    }

    try {
      this.clientOptions = await this.startupPromise;
      return this.clientOptions;
    } finally {
      this.startupPromise = undefined;
    }
  }

  async stop(): Promise<void> {
    const child = this.childProcess;
    this.childProcess = undefined;
    this.clientOptions = undefined;

    if (!child || child.killed || child.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
        resolve();
      }, 5_000);

      child.once('exit', () => {
        clearTimeout(timeoutId);
        resolve();
      });

      child.kill();
    });
  }

  private async start(timeoutMs: number): Promise<BridgeClientOptions> {
    await ensurePathExists(this.bridgeExecutablePath);
    await fs.mkdir(this.runtimeDir, { recursive: true });

    const port = await getAvailablePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const logState = createBridgeLogState();

    const child = spawn(this.bridgeExecutablePath, [], {
      cwd: path.dirname(this.bridgeExecutablePath),
      env: {
        ...process.env,
        MIHOME_BRIDGE_HOST: '127.0.0.1',
        MIHOME_BRIDGE_PORT: String(port),
        MIHOME_BRIDGE_RUNTIME_DIR: this.runtimeDir,
        MIHOME_BRIDGE_LOG_LEVEL: process.env.MIHOME_BRIDGE_LOG_LEVEL ?? 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.childProcess = child;
    wireBridgeLogs(child, logState);

    try {
      await Promise.race([
        waitForBridgeReady(baseUrl, child),
        rejectOnBridgeError(child, logState),
        rejectOnBridgeExit(child, logState),
      ]);

      return {
        baseUrl,
        timeoutMs,
      };
    } catch (error) {
      await this.stop();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Bundled MiHome bridge failed to start.\n${detail}`);
    }
  }
}

function resolveBridgeExecutablePath(): string {
  if (process.env.MIHOME_BRIDGE_EXECUTABLE) {
    return process.env.MIHOME_BRIDGE_EXECUTABLE;
  }

  const executableName = process.platform === 'win32' ? 'mihome-bridge-service.exe' : 'mihome-bridge-service';
  return path.join(process.resourcesPath, 'bridge', executableName);
}

async function ensurePathExists(targetPath: string): Promise<void> {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`Bundled bridge executable was not found: ${targetPath}`);
  }
}

async function waitForBridgeReady(baseUrl: string, child: BridgeChildProcess): Promise<void> {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Bridge process exited early with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(1_500),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Bridge is still starting up.
    }

    await delay(healthcheckIntervalMs);
  }

  throw new Error(`Timed out waiting for bridge healthcheck: ${baseUrl}`);
}

function rejectOnBridgeError(child: BridgeChildProcess, logState: BridgeLogState): Promise<never> {
  return new Promise((_resolve, reject) => {
    child.once('error', (error) => {
      reject(new Error(`${error.message}\n${renderBridgeLogs(logState)}`));
    });
  });
}

function rejectOnBridgeExit(child: BridgeChildProcess, logState: BridgeLogState): Promise<never> {
  return new Promise((_resolve, reject) => {
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `Bridge process exited unexpectedly. exitCode=${String(code)}, signal=${String(signal)}\n${renderBridgeLogs(logState)}`,
        ),
      );
    });
  });
}

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free bridge port.')));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface BridgeLogState {
  stdout: string;
  stderr: string;
}

function createBridgeLogState(): BridgeLogState {
  return {
    stdout: '',
    stderr: '',
  };
}

function wireBridgeLogs(child: BridgeChildProcess, logState: BridgeLogState): void {
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk: string) => {
    logState.stdout = appendLogChunk(logState.stdout, chunk);
    console.log(`[mihome-bridge] ${chunk.trimEnd()}`);
  });

  child.stderr.on('data', (chunk: string) => {
    logState.stderr = appendLogChunk(logState.stderr, chunk);
    console.error(`[mihome-bridge] ${chunk.trimEnd()}`);
  });
}

function appendLogChunk(existing: string, nextChunk: string): string {
  const merged = `${existing}${nextChunk}`;
  if (merged.length <= logBufferLimit) {
    return merged;
  }

  return merged.slice(-logBufferLimit);
}

function renderBridgeLogs(logState: BridgeLogState): string {
  const segments = [
    logState.stdout.trim() ? `stdout:\n${logState.stdout.trim()}` : '',
    logState.stderr.trim() ? `stderr:\n${logState.stderr.trim()}` : '',
  ].filter(Boolean);

  return segments.length > 0 ? segments.join('\n\n') : 'No extra bridge logs were captured.';
}

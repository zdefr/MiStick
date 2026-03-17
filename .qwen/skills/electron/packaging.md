# Packaging & Distribution

## Electron Forge Configuration

```typescript
// forge.config.ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './resources/icon',
    appBundleId: 'com.company.app',
    appCategoryType: 'public.app-category.productivity',
    // macOS
    osxSign: {
      identity: 'Developer ID Application: Company Name (TEAMID)',
      hardenedRuntime: true,
      entitlements: './build/entitlements.mac.plist',
      'entitlements-inherit': './build/entitlements.mac.plist',
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_PASSWORD!,
      teamId: process.env.APPLE_TEAM_ID!,
    },
  },
  makers: [
    new MakerSquirrel({
      certificateFile: process.env.WIN_CERT_PATH,
      certificatePassword: process.env.WIN_CERT_PASSWORD,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ format: 'ULFO' }),
    new MakerDeb({
      options: {
        maintainer: 'Company Name',
        homepage: 'https://example.com',
        icon: './resources/icon.png',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'company', name: 'app' },
        prerelease: false,
        draft: true,
      },
    },
  ],
};

export default config;
```

---

## Electron Builder Configuration

```yaml
# electron-builder.yml
appId: com.company.app
productName: My Application
copyright: Copyright © 2024 Company Name

directories:
  output: dist
  buildResources: resources

files:
  - "dist/**/*"
  - "package.json"

asar: true
asarUnpack:
  - "**/*.node"  # Native modules

mac:
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - target: dmg
      arch: [x64, arm64]
    - target: zip
      arch: [x64, arm64]

win:
  target:
    - target: nsis
      arch: [x64, ia32]
    - target: portable
      arch: [x64]
  certificateFile: ${WIN_CSC_LINK}
  certificatePassword: ${WIN_CSC_KEY_PASSWORD}

linux:
  target:
    - AppImage
    - deb
    - rpm
  category: Utility
  maintainer: support@company.com

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico

publish:
  provider: github
  owner: company
  repo: app
  releaseType: release
```

---

## Auto-Updates

```typescript
// src/main/updater.ts
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, dialog, app } from 'electron';
import log from 'electron-log';

// 指数退避配置
const BACKOFF_CONFIG = {
  minDelay: 60 * 1000,      // 最小延迟 1 分钟
  maxDelay: 4 * 60 * 60 * 1000,  // 最大延迟 4 小时
  multiplier: 2,            // 倍增系数
  jitter: 0.1,              // 随机抖动 10%
};

let checkAttempts = 0;
let checkTimer: NodeJS.Timeout | null = null;

function calculateNextDelay(): number {
  // 指数退避
  const exponentialDelay = BACKOFF_CONFIG.minDelay * Math.pow(
    BACKOFF_CONFIG.multiplier,
    checkAttempts
  );
  // 限制在最大延迟内
  const cappedDelay = Math.min(exponentialDelay, BACKOFF_CONFIG.maxDelay);
  // 添加随机抖动避免所有客户端同时请求
  const jitter = cappedDelay * BACKOFF_CONFIG.jitter * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

function scheduleNextCheck(): void {
  if (checkTimer) clearTimeout(checkTimer);
  
  const delay = calculateNextDelay();
  log.info(`下次更新检查将在 ${Math.round(delay / 1000)} 秒后`);
  
  checkTimer = setTimeout(() => {
    checkForUpdatesWithBackoff();
  }, delay);
}

function checkForUpdatesWithBackoff(): void {
  autoUpdater.checkForUpdates()
    .then((result) => {
      if (!result?.updateInfo) {
        // 没有可用更新，增加尝试次数
        checkAttempts++;
        scheduleNextCheck();
      } else {
        // 有可用更新，重置计数器
        checkAttempts = 0;
      }
    })
    .catch((error) => {
      log.error('更新检查失败:', error.message);
      // 失败时也增加尝试次数
      checkAttempts++;
      scheduleNextCheck();
    });
}

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // For development testing
  if (process.env.NODE_ENV === 'development') {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update:available', info.version);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      buttons: ['Download', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', progress.percent);
    mainWindow.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.setProgressBar(-1);
    // 重置计数器
    checkAttempts = 0;

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart now to install?',
      buttons: ['Restart', 'Later'],
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('update-not-available', () => {
    // 没有更新时，安排下次检查
    scheduleNextCheck();
  });

  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);
    // 错误时也安排下次检查
    scheduleNextCheck();
  });

  // Check for updates on startup (with delay to avoid network contention)
  app.whenReady().then(() => {
    setTimeout(() => {
      checkAttempts = 0;
      checkForUpdatesWithBackoff();
    }, 5000);
  });

  // 不再使用固定间隔，改用指数退避策略
  // setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}
```

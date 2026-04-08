import path from 'node:path';
import { app, nativeImage, type NativeImage } from 'electron';

const APP_ICON_RELATIVE_PATH = path.join('assets', 'app-icon.png');

export function resolveAppIconPath(): string {
  return path.join(app.getAppPath(), APP_ICON_RELATIVE_PATH);
}

export function createAppIconImage(): NativeImage {
  const iconPath = resolveAppIconPath();
  const iconImage = nativeImage.createFromPath(iconPath);

  if (iconImage.isEmpty()) {
    console.warn(`App icon could not be loaded from path: ${iconPath}`);
  }

  return iconImage;
}

export function createTrayIconImage(): NativeImage {
  const iconImage = createAppIconImage();

  if (iconImage.isEmpty()) {
    return iconImage;
  }

  if (process.platform === 'win32') {
    return iconImage.resize({ width: 16, height: 16 });
  }

  return iconImage;
}

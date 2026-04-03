import type { ConfigService } from '../config';
import type { DeviceFavoritePort } from './ports';

export class ConfigDeviceFavoritePort implements DeviceFavoritePort {
  constructor(private readonly configService: ConfigService) {}

  async getFavoriteDeviceIds(): Promise<string[]> {
    const favorites = await this.configService.getByPath<string[]>('devices.favorites');
    return this.normalizeFavorites(favorites);
  }

  async setFavorite(deviceId: string, isFavorite: boolean): Promise<string[]> {
    const currentFavorites = await this.getFavoriteDeviceIds();
    const nextFavorites = currentFavorites.filter((favoriteId) => favoriteId !== deviceId);

    if (isFavorite) {
      nextFavorites.push(deviceId);
    }

    await this.configService.setByPath('devices.favorites', nextFavorites);
    return nextFavorites;
  }

  private normalizeFavorites(favorites: string[]): string[] {
    return Array.from(
      new Set(
        favorites
          .filter((favoriteId): favoriteId is string => typeof favoriteId === 'string')
          .map((favoriteId) => favoriteId.trim())
          .filter((favoriteId) => favoriteId.length > 0),
      ),
    );
  }
}

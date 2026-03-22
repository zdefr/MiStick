import type { MijiaDesktopApi } from '../shared/contracts/app-api';

declare global {
  interface Window {
    mijia: MijiaDesktopApi;
  }
}

export {};

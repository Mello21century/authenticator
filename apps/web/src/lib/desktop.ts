/** Bridge exposed by apps/desktop preload. Undefined in a normal browser. */
export interface DesktopBridge {
  native: true;
  platform: 'darwin' | 'win32' | 'linux';
  getApiUrl(): Promise<string>;
  setApiUrl(url: string): Promise<void>;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(t: string | null): Promise<void>;
  canBiometric(): Promise<boolean>;
  unlockBiometric(): Promise<boolean>;
  markUnlocked(): Promise<void>;
  isLocked(): Promise<boolean>;
  onLock(cb: () => void): () => void;
  getLockTimeout(): Promise<number>;
  setLockTimeout(ms: number): Promise<void>;
}

declare global {
  interface Window { desktop?: DesktopBridge }
}

export const desktop = typeof window !== 'undefined' ? window.desktop : undefined;

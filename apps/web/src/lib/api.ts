import { createApi } from '@auth/shared';
import { desktop } from './desktop';

let authLost: () => void = () => {};
export const onAuthLost = (cb: () => void) => { authLost = cb; };

// Desktop resolves its server URL at runtime (configurable on the login screen); browser uses same-origin /api.
export const baseUrl = { current: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api' };

export const api = createApi({
  get baseUrl() { return baseUrl.current; },
  native: !!desktop,
  getRefreshToken: desktop ? () => desktop!.getRefreshToken() : undefined,
  setRefreshToken: desktop ? t => desktop!.setRefreshToken(t) : undefined,
  onAuthLost: () => authLost(),
} as Parameters<typeof createApi>[0]);

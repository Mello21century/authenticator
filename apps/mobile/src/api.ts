import * as SecureStore from 'expo-secure-store';
import { createApi } from '@auth/shared';

const KEY_RT = 'refreshToken';
const KEY_URL = 'apiUrl';
export const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';

export const server = { url: DEFAULT_API };
let authLost = () => {};
export const onAuthLost = (cb: () => void) => { authLost = cb; };

export async function loadServer() {
  server.url = (await SecureStore.getItemAsync(KEY_URL)) ?? DEFAULT_API;
}
export async function saveServer(url: string) {
  server.url = url.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(KEY_URL, server.url);
}

export const api = createApi({
  get baseUrl() { return server.url; },
  native: true,
  getRefreshToken: () => SecureStore.getItemAsync(KEY_RT),
  setRefreshToken: t => (t ? SecureStore.setItemAsync(KEY_RT, t, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }) : SecureStore.deleteItemAsync(KEY_RT)),
  onAuthLost: () => authLost(),
} as Parameters<typeof createApi>[0]);

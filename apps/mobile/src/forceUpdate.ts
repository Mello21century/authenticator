import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { isOutdated } from '@auth/shared';
import { api } from './api';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const PLAY_FALLBACK = 'market://details?id=com.sz4h.authenticator';

/** Asks the server for the minimum supported version on launch and whenever the app returns to the foreground.
 *  Returns the store URL to send the user to when this build is too old, otherwise null. Offline = never blocks. */
export function useForceUpdate(enabled: boolean): { required: boolean; storeUrl: string } {
  const [state, setState] = useState({ required: false, storeUrl: '' });
  useEffect(() => {
    if (!enabled) return; // wait until the saved server URL is loaded
    const check = () => api.appVersion().then(v => setState({
      required: isOutdated(APP_VERSION, v.minVersion),
      storeUrl: Platform.OS === 'ios' ? v.iosUrl : v.androidUrl || PLAY_FALLBACK,
    })).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [enabled]);
  return state;
}

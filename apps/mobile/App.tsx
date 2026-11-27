import { useEffect, useRef, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Entry } from '@auth/shared';
import AddEntry from './src/screens/AddEntry';
import Login from './src/screens/Login';
import Settings from './src/screens/Settings';
import Vault from './src/screens/Vault';
import { APP_VERSION, useForceUpdate } from './src/forceUpdate';
import { SessionProvider, useSession } from './src/session';
import { useTheme } from './src/theme';
import { Btn, T } from './src/ui';

type Route = { name: 'vault' } | { name: 'add'; editing?: Entry } | { name: 'settings' };

function Root() {
  const c = useTheme();
  const { ready, user, locked, covered, unlock, lockError, signOut } = useSession();
  const [route, setRoute] = useState<Route>({ name: 'vault' });
  const [vaultKey, setVaultKey] = useState(0);
  // prompt biometrics once per lock event; the prompt itself flips AppState, so don't re-prompt after a cancel
  const prompted = useRef(false);
  useEffect(() => {
    if (!locked) { prompted.current = false; return; }
    if (user && !covered && !prompted.current) { prompted.current = true; void unlock(); }
  }, [user, locked, covered, unlock]);

  const update = useForceUpdate(ready);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (update.required) return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
      <Image source={require('./assets/icon.png')} style={{ width: 68, height: 68, borderRadius: 16 }} />
      <T size={18} weight="600">Update required</T>
      <T muted style={{ textAlign: 'center' }}>This version ({APP_VERSION}) is no longer supported. Install the latest version to keep using Space Authenticator.</T>
      {update.storeUrl
        ? <Btn kind="primary" title="Update now" onPress={() => void Linking.openURL(update.storeUrl)} style={{ alignSelf: 'stretch' }} />
        : <T muted style={{ textAlign: 'center' }}>Open the App Store and update Space Authenticator.</T>}
    </View>
  );
  if (!user) return <Login />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} importantForAccessibility={locked || covered ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={locked || covered}>
      {route.name === 'vault' && <Vault key={vaultKey} onAdd={() => setRoute({ name: 'add' })} onEdit={e => setRoute({ name: 'add', editing: e })} onSettings={() => setRoute({ name: 'settings' })} />}
      {route.name === 'add' && <AddEntry editing={route.editing} onDone={() => { setVaultKey(k => k + 1); setRoute({ name: 'vault' }); }} />}
      {route.name === 'settings' && <Settings onBack={() => { setVaultKey(k => k + 1); setRoute({ name: 'vault' }); }} />}
      </View>
      {(locked || covered) && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Image source={require('./assets/icon.png')} style={{ width: 68, height: 68, borderRadius: 16 }} />
          <T size={18} weight="600">Space Authenticator is locked</T>
          {locked && !covered && <Btn kind="primary" title="Unlock" onPress={unlock} style={{ alignSelf: 'stretch' }} />}
          {!!lockError && <T style={{ color: c.danger, textAlign: 'center' }}>{lockError}</T>}
          {locked && !covered && <Btn title="Sign out" onPress={signOut} style={{ alignSelf: 'stretch' }} />}
        </View>
      )}
    </View>
  );
}

export default function App() {
  const c = useTheme();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <StatusBar style="auto" />
          <Root />
        </SafeAreaView>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

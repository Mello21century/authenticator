import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { importVault, type Member } from '@auth/shared';
import { api } from '../api';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Btn, Card, ErrorText, Input, T, errMsg } from '../ui';

const TIMEOUTS = [{ ms: 60_000, label: '1 min' }, { ms: 900_000, label: '15 min' }, { ms: 3_600_000, label: '1 hour' }, { ms: 0, label: 'On launch' }];

export default function Settings({ onBack }: { onBack(): void }) {
  const c = useTheme();
  const { user, signOut, lockTimeout, setLockTimeout } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back"><T size={22}>←</T></Pressable>
        <T size={20} weight="700">Settings</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card>
          <T muted size={12} weight="600">APP LOCK</T>
          <T muted>Face ID / fingerprint is required on every launch and after:</T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {TIMEOUTS.map(t => <Btn key={t.ms} title={t.label} kind={lockTimeout === t.ms ? 'primary' : 'default'} onPress={() => setLockTimeout(t.ms)} style={{ paddingVertical: 8 }} />)}
          </View>
        </Card>
        <TwoFactor />
        {user?.role === 'owner' && <Members />}
        <ImportExport />
        <Card>
          <T muted>Signed in as {user?.email}</T>
          <Btn kind="danger" title="Sign out" onPress={signOut} />
        </Card>
      </ScrollView>
    </View>
  );
}

function TwoFactor() {
  const { user, reloadUser } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  return (
    <Card>
      <T muted size={12} weight="600">TWO-FACTOR SIGN-IN</T>
      <T>{user?.mfaEnabled ? 'On' : 'Off. Anyone with your password can open your vault.'}</T>
      {!user?.mfaEnabled && !setup && <Btn kind="primary" title="Turn on" onPress={() => api.mfaSetup().then(setSetup, e => setErr(errMsg(e)))} />}
      {setup && (
        <>
          <T muted>Add this key to a different authenticator app, then enter its code.</T>
          <Pressable onPress={() => Clipboard.setStringAsync(setup.secret)}><T weight="600" style={{ letterSpacing: 1 }}>{setup.secret}  ⧉</T></Pressable>
          <Input label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
          <Input label="Your password" value={password} onChangeText={setPassword} secureTextEntry />
          <Btn kind="primary" title="Turn on" onPress={async () => {
            setErr('');
            try {
              const r = await api.mfaEnable(code.trim(), password);
              setSetup(null); setCode(''); setPassword('');
              await reloadUser();
              Alert.alert('Save your recovery codes', r.recoveryCodes.join('\n'), [
                { text: 'Copy', onPress: () => Clipboard.setStringAsync(r.recoveryCodes.join('\n')) },
                { text: 'Done' },
              ]);
            } catch (e) { setErr(errMsg(e)); }
          }} />
        </>
      )}
      {user?.mfaEnabled && <T muted size={13}>Turn off from the website or desktop app.</T>}
      <ErrorText msg={err} />
    </Card>
  );
}

function Members() {
  const [list, setList] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const load = () => api.listMembers().then(setList).catch(e => setErr(errMsg(e)));
  useEffect(() => { void load(); }, []);
  return (
    <Card>
      <T muted size={12} weight="600">MEMBERS</T>
      <T muted>Members see codes you share with them. Share from the website or desktop app.</T>
      <Input value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" />
      <Btn kind="primary" title="Invite" onPress={async () => {
        setErr('');
        try { await api.addMember(email.trim()); setEmail(''); await load(); } catch (e) { setErr(errMsg(e)); }
      }} />
      <ErrorText msg={err} />
      {list.map(m => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ flex: 1 }}>{m.email}{m.activated ? '' : '  (invited)'}</T>
          <Btn kind="danger" title="Remove" style={{ paddingVertical: 6 }} onPress={() => Alert.alert(`Remove ${m.email}?`, 'Their account and private entries are deleted.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => api.removeMember(m.id).then(load, e => setErr(errMsg(e))) },
          ])} />
        </View>
      ))}
    </Card>
  );
}

function ImportExport() {
  const { user } = useSession();
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  return (
    <Card>
      <T muted size={12} weight="600">IMPORT & EXPORT</T>
      <Input label="Paste an export (Aegis, 2FAS, Proton JSON) or otpauth:// links" value={text} onChangeText={setText} multiline style={{ minHeight: 90, textAlignVertical: 'top' }} />
      <Btn title="Import" disabled={!text.trim()} onPress={async () => {
        setErr('');
        try {
          const r = importVault(text);
          const res = await api.importEntries(r.entries);
          setText('');
          Alert.alert('Imported', `${res.imported} added, ${res.skipped} duplicates${r.errors.length ? `, ${r.errors.length} unreadable` : ''}`);
        } catch (e) { setErr(errMsg(e)); }
      }} />
      <Input label="Password (for export)" value={password} onChangeText={setPassword} secureTextEntry />
      {user?.mfaEnabled && <Input label="Two-factor code" value={code} onChangeText={setCode} keyboardType="number-pad" />}
      <Btn title="Export…" disabled={!password} onPress={async () => {
        setErr('');
        try {
          const f = await api.exportVault(password, code.trim() || undefined);
          setPassword(''); setCode('');
          await Share.share({ message: JSON.stringify(f, null, 2), title: 'Authenticator export' });
        } catch (e) { setErr(errMsg(e)); }
      }} />
      <T muted size={13}>The export contains your secrets in plain text.</T>
      <ErrorText msg={err} />
    </Card>
  );
}

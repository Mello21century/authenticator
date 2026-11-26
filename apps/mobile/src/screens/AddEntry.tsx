import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { importVault, parseOtpauthUri, type Entry, type EntryInput } from '@auth/shared';
import { api } from '../api';
import { useTheme } from '../theme';
import { Btn, ErrorText, Input, T, errMsg } from '../ui';

const blank: EntryInput = { issuer: '', label: '', secret: '', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' };

export default function AddEntry({ editing, onDone }: { editing?: Entry; onDone(): void }) {
  const c = useTheme();
  const [perm, requestPerm] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'form'>(editing ? 'form' : 'scan');
  const [f, setF] = useState<EntryInput>(editing ? { ...blank, ...editing, secret: '' } : blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);
  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) => setF(x => ({ ...x, [k]: v }));

  async function onScan(data: string) {
    if (scanned) return;
    setScanned(true);
    try {
      if (data.startsWith('otpauth-migration://')) {
        const r = importVault(data);
        const res = await api.importEntries(r.entries);
        Alert.alert('Imported', `${res.imported} added${res.skipped ? `, ${res.skipped} already in vault` : ''}`);
        onDone();
        return;
      }
      setF(parseOtpauthUri(data));
      setMode('form');
    } catch (e) {
      Alert.alert('Not a 2FA QR code', errMsg(e), [{ text: 'OK', onPress: () => setScanned(false) }]);
    }
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (editing) {
        const p: Partial<EntryInput> = { ...f };
        if (!f.secret) delete p.secret;
        await api.updateEntry(editing.id, p);
      } else await api.createEntry(f);
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  const header = (
    <View style={s.head}>
      <Pressable onPress={onDone} hitSlop={10}><T style={{ color: c.accent }}>Cancel</T></Pressable>
      <T weight="600" size={17}>{editing ? 'Edit account' : 'Add account'}</T>
      <View style={{ width: 50 }} />
    </View>
  );

  if (mode === 'scan') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {header}
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
          {perm?.granted ? (
            <View style={[s.camera, { borderColor: c.border }]}>
              <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={r => onScan(r.data)} />
            </View>
          ) : (
            <View style={[s.camera, { borderColor: c.border, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }]}>
              <T muted style={{ textAlign: 'center' }}>Allow camera access to scan 2FA QR codes.</T>
              <Btn kind="primary" title="Allow camera" onPress={requestPerm} />
            </View>
          )}
          <T muted style={{ textAlign: 'center' }}>Point at the QR code shown by the service. Google Authenticator export codes work too.</T>
          <Btn title="Enter key manually" onPress={() => setMode('form')} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Input label="Service" value={f.issuer} onChangeText={v => set('issuer', v)} placeholder="GitHub" autoCapitalize="words" />
        <Input label="Account" value={f.label} onChangeText={v => set('label', v)} placeholder="you@example.com" />
        <Input label={editing ? 'Secret key (leave empty to keep)' : 'Secret key'} value={f.secret} onChangeText={v => set('secret', v)} placeholder="JBSW Y3DP EHPK 3PXP" autoCapitalize="characters" />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['totp', 'steam'] as const).map(t => <Btn key={t} title={t === 'totp' ? 'TOTP' : 'Steam'} kind={f.type === t ? 'primary' : 'default'} onPress={() => set('type', t)} style={{ paddingVertical: 8 }} />)}
          {f.type === 'totp' && ([6, 8] as const).map(d => <Btn key={d} title={`${d} digits`} kind={f.digits === d ? 'primary' : 'default'} onPress={() => set('digits', d)} style={{ paddingVertical: 8 }} />)}
        </View>
        <ErrorText msg={err} />
        <Btn kind="primary" title={editing ? 'Save' : 'Add account'} onPress={save} busy={busy} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  camera: { flex: 1, maxHeight: 420, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
});

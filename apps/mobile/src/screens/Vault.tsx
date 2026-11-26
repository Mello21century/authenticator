import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { avatarColor, formatCode, nextRefreshDelay, remainingMs, type CodesResponse, type Entry } from '@auth/shared';
import { api } from '../api';
import { useSession } from '../session';
import { mono, useTheme } from '../theme';
import { T, errMsg } from '../ui';

export default function Vault({ onAdd, onEdit, onSettings }: { onAdd(): void; onEdit(e: Entry): void; onSettings(): void }) {
  const c = useTheme();
  const { locked } = useSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [codes, setCodes] = useState<(CodesResponse & { offset: number }) | null>(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [, tick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadEntries = useCallback(() => api.listEntries().then(setEntries).catch(e => Alert.alert('Error', errMsg(e))), []);

  const loadCodes = useCallback(async () => {
    clearTimeout(timer.current);
    try {
      const r = await api.codes();
      setCodes({ ...r, offset: r.serverTime - Date.now() });
      timer.current = setTimeout(loadCodes, nextRefreshDelay(r.codes, r.serverTime));
    } catch { timer.current = setTimeout(loadCodes, 5000); }
  }, []);

  useEffect(() => { void loadEntries(); }, [loadEntries]);
  useEffect(() => {
    if (locked) { clearTimeout(timer.current); setCodes(null); return; } // never keep codes while locked
    void loadCodes();
    const id = setInterval(() => tick(x => x + 1), 1000);
    return () => { clearTimeout(timer.current); clearInterval(id); };
  }, [locked, loadCodes]);

  const map = useMemo(() => new Map((codes?.codes ?? []).map(x => [x.entryId, x])), [codes]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (entries ?? []).filter(e => !s || `${e.issuer} ${e.label}`.toLowerCase().includes(s));
  }, [entries, q]);

  async function copy(code: string) {
    await Clipboard.setStringAsync(code);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToast('Copied'); setTimeout(() => setToast(''), 1500);
  }

  function menu(e: Entry) {
    if (e.readOnly) return;
    Alert.alert(e.issuer || e.label, undefined, [
      { text: 'Edit', onPress: () => onEdit(e) },
      { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete account?', 'You may lose access to that account.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => api.deleteEntry(e.id).then(loadEntries).then(loadCodes).catch(x => Alert.alert('Error', errMsg(x))) },
      ]) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={s.top}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={c.muted} style={[s.search, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]} accessibilityLabel="Search accounts" />
        <Pressable onPress={onSettings} hitSlop={10} accessibilityLabel="Settings"><T size={22}>⚙︎</T></Pressable>
      </View>
      <FlatList
        data={list}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void loadEntries(); void loadCodes(); }} tintColor={c.muted} />}
        ListEmptyComponent={entries ? (
          <View style={{ alignItems: 'center', paddingTop: 80, gap: 8 }}>
            <T size={40}>🔐</T><T weight="600">No accounts yet</T><T muted>Tap + to scan a QR code.</T>
          </View>
        ) : undefined}
        renderItem={({ item: e }) => {
          const code = map.get(e.id);
          const left = code ? remainingMs(code.expiresAt, codes!.offset) : 0;
          const live = !!code && left > 0;
          const name = e.issuer || e.label || 'Account';
          return (
            <Pressable onPress={() => live && copy(code!.code)} onLongPress={() => menu(e)}
              style={({ pressed }) => [s.card, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.85 : 1 }]}
              accessibilityLabel={`${name}. Tap to copy code`}>
              <View style={[s.avatar, { backgroundColor: avatarColor(name) }]}><T weight="700" style={{ color: '#fff' }}>{name.slice(0, 1).toUpperCase()}</T></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T weight="600" style={{ flexShrink: 1 }}>{name}</T>
                  {e.readOnly && <T size={11} muted style={{ backgroundColor: c.surface2, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden' }}>Shared</T>}
                </View>
                {!!e.issuer && !!e.label && <T muted size={13}>{e.label}</T>}
                <T size={26} weight="600" style={{ fontFamily: mono, letterSpacing: 1.5, marginTop: 4, color: live ? (left < 5000 ? c.danger : c.text) : c.muted }}>
                  {live ? formatCode(code!.code) : '•••  •••'}
                </T>
              </View>
              {live && <T muted size={13} style={{ fontVariant: ['tabular-nums'] }}>{Math.ceil(left / 1000)}s</T>}
            </Pressable>
          );
        }}
      />
      {!!toast && <View style={[s.toast, { backgroundColor: c.text }]}><T style={{ color: c.bg }} weight="600">{toast}</T></View>}
      <Pressable onPress={onAdd} style={[s.fab, { backgroundColor: c.accent }]} accessibilityLabel="Add account"><T size={30} style={{ color: c.accentText, marginTop: -2 }}>+</T></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  search: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1 },
  avatar: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 22, bottom: 36, width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 110, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
});

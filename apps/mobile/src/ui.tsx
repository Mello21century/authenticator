import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Btn({ title, onPress, kind = 'default', disabled, busy, style }: { title: string; onPress(): void; kind?: 'primary' | 'default' | 'danger'; disabled?: boolean; busy?: boolean; style?: ViewStyle }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.danger + '2e' : c.surface2;
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(p: TextInputProps & { label?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {p.label && <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>{p.label}</Text>}
      <TextInput placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} {...p}
        style={[s.input, { backgroundColor: c.surface2, borderColor: c.border, color: c.text }, p.style]} />
    </View>
  );
}

export function T({ children, muted, size = 15, weight, style }: { children: ReactNode; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700'; style?: object }) {
  const c = useTheme();
  return <Text style={[{ color: muted ? c.muted : c.text, fontSize: size, fontWeight: weight }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  return <View style={[s.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
}

export const ErrorText = ({ msg }: { msg: string }) => (msg ? <Text style={{ color: useTheme().danger, fontSize: 13 }}>{msg}</Text> : null);

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

const s = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  btnText: { fontWeight: '600', fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
});

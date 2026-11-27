import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { api, saveServer, server } from '../api';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { Btn, ErrorText, Input, T, errMsg } from '../ui';

type Mode = 'login' | 'signup' | 'forgot' | 'mfa';

export default function Login() {
  const c = useTheme();
  const { setSession } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [url, setUrl] = useState(server.url);
  const [showServer, setShowServer] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(''); setInfo(''); setBusy(true);
    try {
      if (url !== server.url) await saveServer(url);
      if (mode === 'login') {
        const r = await api.login(email.trim(), password);
        if ('mfaRequired' in r) { setMfaToken(r.mfaToken); setMode('mfa'); } else setSession(r);
      } else if (mode === 'signup') setSession(await api.signup(email.trim(), password));
      else if (mode === 'mfa') setSession(await api.loginMfa(mfaToken, code.trim()));
      else { await api.forgotPassword(email.trim()); setInfo('If that email has an account, a reset link is on its way.'); }
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  const title = { login: 'Sign in', signup: 'Create account', forgot: 'Reset password', mfa: 'Two-factor code' }[mode];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} />
          <T size={22} weight="700">Space Authenticator</T>
        </View>
        <T size={18} weight="600">{title}</T>
        {mode === 'mfa' ? (
          <Input label="Code or recovery code" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" autoFocus />
        ) : (
          <>
            <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="username" autoComplete="email" />
            {mode !== 'forgot' && <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType={mode === 'signup' ? 'newPassword' : 'password'} />}
          </>
        )}
        <ErrorText msg={err} />
        {!!info && <T muted>{info}</T>}
        <Btn kind="primary" title={mode === 'forgot' ? 'Send link' : mode === 'mfa' ? 'Verify' : title} onPress={submit} busy={busy} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {mode === 'login' ? (
            <>
              <Pressable onPress={() => setMode('forgot')}><T style={{ color: c.accent }}>Forgot password?</T></Pressable>
              <Pressable onPress={() => setMode('signup')}><T style={{ color: c.accent }}>Create account</T></Pressable>
            </>
          ) : (
            <Pressable onPress={() => { setMode('login'); setErr(''); setInfo(''); }}><T style={{ color: c.accent }}>Back to sign in</T></Pressable>
          )}
        </View>
        <Pressable onPress={() => setShowServer(x => !x)}><T muted size={13}>Server ▾</T></Pressable>
        {showServer && <Input label="API URL" value={url} onChangeText={setUrl} keyboardType="url" placeholder="https://auth.example.com/api" />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

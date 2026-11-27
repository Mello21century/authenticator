import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, baseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { desktop } from '../lib/desktop';
import { Field, errMsg } from '../lib/ui';

function Shell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><img className="brand-mark" src="./logo.png" alt="" /><h1>Space Authenticator</h1></div>
        <div><h2>{title}</h2>{sub && <p className="muted" style={{ margin: '4px 0 0' }}>{sub}</p>}</div>
        {children}
      </div>
    </div>
  );
}

function useSubmit(fn: () => Promise<void>) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return {
    err, busy,
    onSubmit: async (e: FormEvent) => {
      e.preventDefault(); setErr(''); setBusy(true);
      try { await fn(); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
    },
  };
}

function ServerField() {
  const [url, setUrl] = useState(baseUrl.current);
  if (!desktop) return null;
  return (
    <details>
      <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Server</summary>
      <div style={{ marginTop: 10 }}>
        <Field label="API URL" hint="e.g. https://auth.example.com/api">
          <input value={url} onChange={e => setUrl(e.target.value)} onBlur={() => { const u = url.trim().replace(/\/+$/, ''); baseUrl.current = u; void desktop!.setApiUrl(u); }} />
        </Field>
      </div>
    </details>
  );
}

export function Login() {
  const { login, setSession } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const s = useSubmit(async () => {
    if (mfaToken) { setSession(await api.loginMfa(mfaToken, code.trim())); nav('/'); return; }
    const r = await login(email, password);
    if ('mfaRequired' in r) setMfaToken(r.mfaToken); else nav('/');
  });
  if (mfaToken) return (
    <Shell title="Two-factor code" sub="Enter the 6-digit code from your other authenticator, or a recovery code.">
      <form className="stack" onSubmit={s.onSubmit}>
        <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" aria-label="Code" />
        {s.err && <div className="error">{s.err}</div>}
        <button className="btn primary block" disabled={s.busy}>Verify</button>
        <button type="button" className="btn block" onClick={() => setMfaToken(null)}>Back</button>
      </form>
    </Shell>
  );
  return (
    <Shell title="Sign in">
      <form className="stack" onSubmit={s.onSubmit}>
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Field>
        <Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {s.err && <div className="error">{s.err}</div>}
        <button className="btn primary block" disabled={s.busy}>{s.busy ? 'Signing in…' : 'Sign in'}</button>
        <ServerField />
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
          <Link to="/forgot">Forgot password?</Link>
          <Link to="/signup">Create account</Link>
        </div>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const s = useSubmit(async () => {
    if (password !== confirm) throw new Error('Passwords do not match');
    setSession(await api.signup(email, password));
    nav('/');
  });
  return (
    <Shell title="Create account" sub="Your codes sync across web, desktop and mobile.">
      <form className="stack" onSubmit={s.onSubmit}>
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Field>
        <Field label="Password" hint="At least 10 characters"><input type="password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required /></Field>
        <Field label="Confirm password"><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>
        {s.err && <div className="error">{s.err}</div>}
        <button className="btn primary block" disabled={s.busy}>Create account</button>
        <ServerField />
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>Already have one? <Link to="/login">Sign in</Link></p>
      </form>
    </Shell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const s = useSubmit(async () => { await api.forgotPassword(email); setSent(true); });
  return (
    <Shell title="Reset password" sub={sent ? 'If that email has an account, a reset link is on its way. It expires in 30 minutes.' : "We'll email you a link."}>
      {!sent && (
        <form className="stack" onSubmit={s.onSubmit}>
          <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></Field>
          {s.err && <div className="error">{s.err}</div>}
          <button className="btn primary block" disabled={s.busy}>Send link</button>
        </form>
      )}
      <Link to="/login">Back to sign in</Link>
    </Shell>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const invite = params.get('invite') === '1';
  const [password, setPassword] = useState('');
  const s = useSubmit(async () => { await api.resetPassword(params.get('token') ?? '', password); nav('/login', { replace: true }); });
  return (
    <Shell title={invite ? 'Welcome' : 'Choose a new password'} sub={invite ? 'Set a password to join your team vault.' : undefined}>
      <form className="stack" onSubmit={s.onSubmit}>
        <Field label="New password" hint="At least 10 characters"><input type="password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required autoFocus /></Field>
        {s.err && <div className="error">{s.err}</div>}
        <button className="btn primary block" disabled={s.busy}>{invite ? 'Set password' : 'Reset password'}</button>
      </form>
    </Shell>
  );
}

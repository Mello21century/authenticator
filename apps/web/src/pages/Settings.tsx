import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { importVault, type EntryInput } from '@auth/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { desktop } from '../lib/desktop';
import { Field, Modal, download, errMsg, useToast } from '../lib/ui';

export default function Settings() {
  const { user, logout } = useAuth();
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView(); }, [hash]);
  if (!user) return null;
  return (
    <div className="shell">
      <div className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back" style={{ fontSize: 20 }}>←</Link>
        <h1 className="grow">Settings</h1>
      </div>
      <Account />
      <TwoFactor />
      {user.role === 'owner' && <Members />}
      <ImportExport />
      {desktop && <Security />}
      <section className="section">
        <div className="kv"><span className="muted">Signed in as {user.email}</span><button className="btn danger small" onClick={logout}>Sign out</button></div>
      </section>
    </div>
  );
}

function Account() {
  const toast = useToast();
  const { setSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  return (
    <section className="section">
      <h3>Account</h3>
      <div className="kv"><span>Password</span><button className="btn small" onClick={() => setOpen(true)}>Change</button></div>
      {open && (
        <Modal title="Change password" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={async e => {
            e.preventDefault(); setErr('');
            try { setSession(await api.changePassword(cur, next)); setOpen(false); toast('Password changed. Other devices were signed out.'); } catch (x) { setErr(errMsg(x)); }
          }}>
            <Field label="Current password"><input type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" required /></Field>
            <Field label="New password" hint="At least 10 characters"><input type="password" minLength={10} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" required /></Field>
            {err && <div className="error">{err}</div>}
            <button className="btn primary block">Change password</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function TwoFactor() {
  const { user, reloadUser } = useAuth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function start() {
    setErr('');
    try {
      const s = await api.mfaSetup();
      setSetup({ secret: s.secret, qr: await QRCode.toDataURL(s.otpauthUri, { margin: 0, width: 180 }) });
    } catch (e) { toast(errMsg(e)); }
  }

  return (
    <section className="section">
      <h3>Two-factor sign-in</h3>
      <div className="kv">
        <span>{user?.mfaEnabled ? 'On. Sign-in asks for a code from another authenticator app.' : 'Off. Anyone with your password can open your vault.'}</span>
        {user?.mfaEnabled
          ? <button className="btn small" onClick={() => setDisabling(true)}>Turn off</button>
          : <button className="btn primary small" onClick={start}>Turn on</button>}
      </div>
      {setup && (
        <Modal title="Turn on two-factor sign-in" onClose={() => setSetup(null)}>
          <p className="muted" style={{ margin: 0 }}>Scan with a <em>different</em> authenticator app (not this vault), then enter its code.</p>
          <img className="qr" src={setup.qr} alt="Two-factor QR code" width={180} height={180} />
          <code style={{ textAlign: 'center', wordBreak: 'break-all' }}>{setup.secret}</code>
          <form className="stack" onSubmit={async e => {
            e.preventDefault(); setErr('');
            try { const r = await api.mfaEnable(code.trim(), password); setSetup(null); setCodes(r.recoveryCodes); setCode(''); setPassword(''); await reloadUser(); } catch (x) { setErr(errMsg(x)); }
          }}>
            <Field label="6-digit code"><input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></Field>
            <Field label="Your password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            {err && <div className="error">{err}</div>}
            <button className="btn primary block">Turn on</button>
          </form>
        </Modal>
      )}
      {codes && (
        <Modal title="Save your recovery codes" onClose={() => setCodes(null)}>
          <p className="muted" style={{ margin: 0 }}>Each code works once if you lose your other authenticator. They won't be shown again.</p>
          <div className="recovery">{codes.map(c => <span key={c}>{c}</span>)}</div>
          <div className="row">
            <button className="btn grow" onClick={() => { void navigator.clipboard.writeText(codes.join('\n')); toast('Copied'); }}>Copy</button>
            <button className="btn grow" onClick={() => download('authenticator-recovery-codes.txt', codes.join('\n'))}>Download</button>
          </div>
          <button className="btn primary block" onClick={() => setCodes(null)}>I saved them</button>
        </Modal>
      )}
      {disabling && (
        <Modal title="Turn off two-factor sign-in" onClose={() => setDisabling(false)}>
          <form className="stack" onSubmit={async e => {
            e.preventDefault(); setErr('');
            try { await api.mfaDisable(password, code.trim()); setDisabling(false); setCode(''); setPassword(''); await reloadUser(); toast('Two-factor sign-in turned off'); } catch (x) { setErr(errMsg(x)); }
          }}>
            <Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            <Field label="Code or recovery code"><input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" required /></Field>
            {err && <div className="error">{err}</div>}
            <button className="btn danger block">Turn off</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Members() {
  const qc = useQueryClient();
  const toast = useToast();
  const members = useQuery({ queryKey: ['members'], queryFn: api.listMembers });
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  return (
    <section className="section" id="members">
      <h3>Members</h3>
      <p className="muted" style={{ margin: 0 }}>Invite family or teammates. Share accounts from an entry's ⋯ menu. Members see codes only.</p>
      <form className="row" onSubmit={async e => {
        e.preventDefault(); setErr('');
        try { await api.addMember(email.trim()); setEmail(''); await qc.invalidateQueries({ queryKey: ['members'] }); toast('Invite sent'); } catch (x) { setErr(errMsg(x)); }
      }}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" aria-label="Member email" required />
        <button className="btn primary">Invite</button>
      </form>
      {err && <div className="error">{err}</div>}
      {members.data?.map(m => (
        <div className="member" key={m.id}>
          <span className="grow">{m.email}</span>
          {!m.activated && <span className="badge">Invited</span>}
          <button className="btn danger small" onClick={async () => {
            if (!confirm(`Remove ${m.email}? Their account and private entries are deleted.`)) return;
            try { await api.removeMember(m.id); await qc.invalidateQueries({ queryKey: ['members'] }); await qc.invalidateQueries({ queryKey: ['entries'] }); } catch (x) { toast(errMsg(x)); }
          }}>Remove</button>
        </div>
      ))}
    </section>
  );
}

function ImportExport() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [preview, setPreview] = useState<{ entries: EntryInput[]; errors: string[] } | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  function parse(t: string) {
    setErr('');
    try { setPreview(importVault(t)); } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <section className="section" id="import">
      <h3>Import & export</h3>
      <p className="muted" style={{ margin: 0 }}>Import from Aegis, 2FAS, Proton Authenticator (JSON, unencrypted), Google Authenticator export links, or a list of otpauth:// links.</p>
      <div className="row">
        <label className="btn">
          Choose file
          <input type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) parse(await f.text()); e.target.value = ''; }} />
        </label>
        <button className="btn" onClick={() => setExporting(true)}>Export…</button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="…or paste the file contents / links here" aria-label="Import text" />
      {text.trim() && <button className="btn" onClick={() => parse(text)}>Preview import</button>}
      {err && <div className="error">{err}</div>}
      {preview && (
        <Modal title="Import" onClose={() => setPreview(null)}>
          <p style={{ margin: 0 }}>{preview.entries.length} account(s) ready to import.</p>
          {preview.errors.length > 0 && <details><summary className="error">{preview.errors.length} skipped</summary><ul>{preview.errors.map(x => <li key={x} className="muted">{x}</li>)}</ul></details>}
          <button className="btn primary block" disabled={!preview.entries.length} onClick={async () => {
            try {
              const r = await api.importEntries(preview.entries);
              setPreview(null); setText('');
              await qc.invalidateQueries({ queryKey: ['entries'] });
              toast(`Imported ${r.imported}${r.skipped ? `, skipped ${r.skipped} duplicates` : ''}`);
            } catch (x) { setErr(errMsg(x)); setPreview(null); }
          }}>Import</button>
        </Modal>
      )}
      {exporting && (
        <Modal title="Export vault" onClose={() => setExporting(false)}>
          <p className="muted" style={{ margin: 0 }}>The file contains your secrets in plain text. Keep it somewhere safe and delete it after use.{user?.role === 'member' ? ' Accounts shared with you are not included.' : ''}</p>
          <form className="stack" onSubmit={async e => {
            e.preventDefault(); setErr('');
            try {
              const f = await api.exportVault(password, code.trim() || undefined);
              download(`authenticator-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(f, null, 2));
              setExporting(false); setPassword(''); setCode('');
            } catch (x) { setErr(errMsg(x)); }
          }}>
            <Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required autoFocus /></Field>
            {user?.mfaEnabled && <Field label="Two-factor code"><input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" required /></Field>}
            {err && <div className="error">{err}</div>}
            <button className="btn primary block">Download export</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

const TIMEOUTS = [
  { ms: 60_000, label: '1 minute' }, { ms: 15 * 60_000, label: '15 minutes' }, { ms: 3_600_000, label: '1 hour' }, { ms: 0, label: 'Only when the app restarts' },
];

function Security() {
  const [ms, setMs] = useState<number | null>(null);
  const [bio, setBio] = useState(false);
  useEffect(() => { void desktop!.getLockTimeout().then(setMs); void desktop!.canBiometric().then(setBio); }, []);
  return (
    <section className="section">
      <h3>App lock</h3>
      <p className="muted" style={{ margin: 0 }}>{bio ? `Codes are hidden until you unlock with ${desktop!.biometricLabel ?? 'Touch ID'}.` : 'Codes are hidden until you re-enter your password.'} The app always locks when it starts.</p>
      <Field label="Lock again after">
        <select value={ms ?? ''} onChange={e => { const v = Number(e.target.value); setMs(v); void desktop!.setLockTimeout(v); }}>
          {TIMEOUTS.map(t => <option key={t.ms} value={t.ms}>{t.label}</option>)}
        </select>
      </Field>
    </section>
  );
}

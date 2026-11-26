import { useEffect, useState } from 'react';
import { importVault, parseOtpauthUri, type Algorithm, type Entry, type EntryInput } from '@auth/shared';
import { decodeQrImage } from '../lib/qr';
import { Field, Modal, errMsg } from '../lib/ui';

type Mode = 'qr' | 'uri' | 'manual';
const blank: EntryInput = { issuer: '', label: '', secret: '', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' };

interface Props {
  editing?: Entry;
  onClose(): void;
  onSave(e: Partial<EntryInput>): Promise<void>;
  onSaveMany(e: EntryInput[]): Promise<void>;
}

export function EntryForm({ editing, onClose, onSave, onSaveMany }: Props) {
  const [mode, setMode] = useState<Mode>(editing ? 'manual' : 'qr');
  const [f, setF] = useState<EntryInput>(editing ? { ...blank, ...editing, secret: '' } : blank);
  const [uri, setUri] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) => setF(x => ({ ...x, [k]: v }));

  async function handleQrText(text: string) {
    if (text.startsWith('otpauth-migration://')) {
      const r = importVault(text);
      if (!r.entries.length) throw new Error(r.errors[0] ?? 'No accounts in this QR');
      await onSaveMany(r.entries);
      return;
    }
    setF(parseOtpauthUri(text));
    setMode('manual');
  }

  async function fromImage(file: Blob) {
    setErr('');
    try {
      const text = await decodeQrImage(file);
      if (!text) throw new Error('No QR code found in that image');
      await handleQrText(text);
    } catch (e) { setErr(errMsg(e)); }
  }

  useEffect(() => {
    if (mode !== 'qr') return;
    const paste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) { e.preventDefault(); void fromImage(file); }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'uri') await handleQrText(uri.trim());
      else {
        const payload: Partial<EntryInput> = { ...f };
        if (editing && !f.secret) delete payload.secret;
        await onSave(payload);
      }
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Edit account' : 'Add account'} onClose={onClose}>
      {!editing && (
        <div className="tabs">
          {(['qr', 'uri', 'manual'] as Mode[]).map(m => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setErr(''); }}>
              {m === 'qr' ? 'QR image' : m === 'uri' ? 'Link' : 'Manual'}
            </button>
          ))}
        </div>
      )}
      <form className="stack" onSubmit={submit}>
        {mode === 'qr' && (
          <label className="empty" style={{ border: '1.5px dashed var(--border)', borderRadius: 14, padding: 28, cursor: 'pointer' }}>
            <strong style={{ color: 'var(--text)' }}>Choose a QR screenshot</strong>
            <span>or paste an image with ⌘V / Ctrl+V</span>
            <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && fromImage(e.target.files[0])} />
          </label>
        )}
        {mode === 'uri' && (
          <Field label="otpauth:// link" hint="Also accepts Google Authenticator export links (otpauth-migration://)">
            <textarea value={uri} onChange={e => setUri(e.target.value)} placeholder="otpauth://totp/Service:you@example.com?secret=..." autoFocus />
          </Field>
        )}
        {mode === 'manual' && (
          <>
            <Field label="Service"><input value={f.issuer} onChange={e => set('issuer', e.target.value)} placeholder="GitHub" autoFocus /></Field>
            <Field label="Account"><input value={f.label} onChange={e => set('label', e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Secret key" hint={editing ? 'Leave empty to keep the current secret' : undefined}>
              <input value={f.secret} onChange={e => set('secret', e.target.value)} placeholder="JBSW Y3DP EHPK 3PXP" autoComplete="off" spellCheck={false} required={!editing} />
            </Field>
            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Advanced</summary>
              <div className="row" style={{ marginTop: 10 }}>
                <Field label="Type">
                  <select value={f.type} onChange={e => set('type', e.target.value as EntryInput['type'])}>
                    <option value="totp">TOTP</option><option value="steam">Steam</option>
                  </select>
                </Field>
                <Field label="Algorithm">
                  <select value={f.algorithm} onChange={e => set('algorithm', e.target.value as Algorithm)} disabled={f.type === 'steam'}>
                    <option>SHA1</option><option>SHA256</option><option>SHA512</option>
                  </select>
                </Field>
                <Field label="Digits">
                  <select value={f.digits} onChange={e => set('digits', Number(e.target.value))} disabled={f.type === 'steam'}>
                    <option>6</option><option>7</option><option>8</option>
                  </select>
                </Field>
                <Field label="Period">
                  <input type="number" min={15} max={120} value={f.period} onChange={e => set('period', Number(e.target.value))} />
                </Field>
              </div>
            </details>
          </>
        )}
        {err && <div className="error">{err}</div>}
        {mode !== 'qr' && <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Add account'}</button>}
      </form>
    </Modal>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Entry, EntryInput } from '@auth/shared';
import { EntryCard } from '../components/EntryCard';
import { EntryForm } from '../components/EntryForm';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCodes, useTick } from '../lib/codes';
import { desktop } from '../lib/desktop';
import { Modal, errMsg, useToast } from '../lib/ui';

export default function Vault({ locked }: { locked: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  // focus search whenever the window comes to the front, unless the user is typing elsewhere
  useEffect(() => {
    const f = () => { const a = document.activeElement; if (!a || a === document.body) searchRef.current?.focus(); };
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, []);
  const [form, setForm] = useState<{ editing?: Entry } | null>(null);
  const [sharing, setSharing] = useState<Entry | null>(null);
  const entries = useQuery({ queryKey: ['entries'], queryFn: api.listEntries });
  const codes = useCodes(!locked);
  // extension: pre-filter by the current tab's site (only when it changes and something matches)
  const lastHint = useRef<string | null>(null);
  const data = entries.data;
  useEffect(() => {
    if (!desktop?.getSearchHint || !data) return;
    const apply = async () => {
      const h = await desktop!.getSearchHint!();
      if (!h || h === lastHint.current) return;
      lastHint.current = h;
      if (data.some(e => `${e.issuer} ${e.label}`.toLowerCase().includes(h))) { setQ(h); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    void apply();
    window.addEventListener('focus', apply);
    return () => window.removeEventListener('focus', apply);
  }, [data]);
  useTick();

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['entries'] }), qc.invalidateQueries({ queryKey: ['codes'] })]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (entries.data ?? []).filter(e => !s || `${e.issuer} ${e.label}`.toLowerCase().includes(s));
  }, [entries.data, q]);

  async function save(data: Partial<EntryInput>) {
    if (form?.editing) await api.updateEntry(form.editing.id, data);
    else await api.createEntry(data as EntryInput);
    await refresh();
    setForm(null);
    toast(form?.editing ? 'Saved' : 'Account added');
  }

  async function saveMany(items: EntryInput[]) {
    const r = await api.importEntries(items);
    await refresh();
    setForm(null);
    toast(`Added ${r.imported}${r.skipped ? `, ${r.skipped} already in vault` : ''}`);
  }

  const del = useMutation({
    mutationFn: (e: Entry) => api.deleteEntry(e.id),
    onSuccess: () => { void refresh(); toast('Deleted'); },
    onError: e => toast(errMsg(e)),
  });

  return (
    <div className="shell">
      <div className="topbar">
        <div className="search"><input ref={searchRef} autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search accounts" /></div>
        <Link to="/settings" className="icon-btn" aria-label="Settings" style={{ fontSize: 20 }}>⚙</Link>
      </div>

      {entries.isLoading && <div className="empty">Loading…</div>}
      {entries.error && <div className="empty error">{errMsg(entries.error)}</div>}
      {entries.data && entries.data.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: 40 }}>🔐</div>
          <strong style={{ color: 'var(--text)' }}>No accounts yet</strong>
          <span>Add one from a QR code, a link, or a secret key.</span>
          <div className="row">
            <button className="btn primary" onClick={() => setForm({})}>Add account</button>
            <Link className="btn" to="/settings#import">Import</Link>
          </div>
        </div>
      )}

      <div className="list">
        {list.map(e => (
          <EntryCard key={e.id} entry={e} code={locked ? undefined : codes.map.get(e.id)} offset={codes.offset} isOwner={user?.role === 'owner'}
            onEdit={() => setForm({ editing: e })}
            onShare={() => setSharing(e)}
            onDelete={() => confirm(`Delete ${e.issuer || e.label}? You may lose access to that account.`) && del.mutate(e)} />
        ))}
      </div>

      {entries.data && entries.data.length > 0 && <button className="fab" aria-label="Add account" onClick={() => setForm({})}>+</button>}
      {form && <EntryForm editing={form.editing} onClose={() => setForm(null)} onSave={save} onSaveMany={saveMany} />}
      {sharing && <ShareDialog entry={sharing} onClose={() => setSharing(null)} onDone={() => { setSharing(null); void refresh(); toast('Sharing updated'); }} />}
    </div>
  );
}

function ShareDialog({ entry, onClose, onDone }: { entry: Entry; onClose(): void; onDone(): void }) {
  const members = useQuery({ queryKey: ['members'], queryFn: api.listMembers });
  const [sel, setSel] = useState(new Set(entry.sharedWith));
  const [err, setErr] = useState('');
  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Modal title={`Share ${entry.issuer || entry.label}`} onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>Members see the code only. They can't see the secret, edit, or export it.</p>
      {members.data?.length === 0 && <p className="muted">No members yet. Invite them in <Link to="/settings#members">Settings</Link>.</p>}
      <div className="stack">
        {members.data?.map(m => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
            <span className="grow">{m.email}</span>
            {!m.activated && <span className="badge">Invited</span>}
          </label>
        ))}
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn primary block" onClick={() => api.shareEntry(entry.id, [...sel]).then(onDone, e => setErr(errMsg(e)))}>Save</button>
    </Modal>
  );
}

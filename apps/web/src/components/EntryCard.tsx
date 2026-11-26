import { useState } from 'react';
import { avatarColor, formatCode, type CodeItem, type Entry } from '@auth/shared';
import { remainingMs } from '../lib/codes';
import { useToast } from '../lib/ui';

function Ring({ left, period }: { left: number; period: number }) {
  const r = 11, c = 2 * Math.PI * r, frac = Math.min(1, left / (period * 1000));
  const color = left < 5000 ? 'var(--danger)' : 'var(--accent)';
  return (
    <svg className="ring" width="28" height="28" viewBox="0 0 28 28" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--surface2)" strokeWidth="3" />
      <circle cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 14 14)" />
    </svg>
  );
}

interface Props {
  entry: Entry; code?: CodeItem; offset: number; isOwner: boolean;
  onEdit(): void; onDelete(): void; onShare(): void;
}

export function EntryCard({ entry, code, offset, isOwner, onEdit, onDelete, onShare }: Props) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const left = code ? remainingMs(code.expiresAt, offset) : 0;
  const name = entry.issuer || entry.label || 'Account';
  const live = code && left > 0;

  async function copy() {
    if (!live) return;
    await navigator.clipboard.writeText(code.code);
    toast('Copied');
  }

  return (
    <div className="card" onClick={copy} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && copy()} aria-label={`${name}, copy code`}>
      <div className="avatar" style={{ background: avatarColor(name) }}>{name.slice(0, 1).toUpperCase()}</div>
      <div className="card-main">
        <div className="card-title">
          {name}
          {entry.readOnly && <span className="badge">Shared</span>}
          {!entry.readOnly && entry.sharedWith.length > 0 && <span className="badge">Shared ×{entry.sharedWith.length}</span>}
        </div>
        <div className="card-sub">{entry.issuer && entry.label ? entry.label : ' '}</div>
      </div>
      <div className={`code ${live ? (left < 5000 ? 'expiring' : '') : 'hidden'}`}>{live ? formatCode(code.code) : '•••  •••'}</div>
      {code && <Ring left={left} period={code.period} />}
      {!entry.readOnly && (
        <div className="menu-wrap" onClick={e => e.stopPropagation()}>
          <button className="icon-btn" aria-label="More" onClick={() => setMenu(m => !m)}>⋯</button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button onClick={() => { setMenu(false); onEdit(); }}>Edit</button>
              {isOwner && <button onClick={() => { setMenu(false); onShare(); }}>Share with members</button>}
              <button className="danger-text" onClick={() => { setMenu(false); onDelete(); }}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

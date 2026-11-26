import type { CodeItem } from './types';

/** ms left on a code, using offset = serverTime - clientNow measured at fetch */
export function remainingMs(expiresAt: number, offset: number, clientNow = Date.now()): number {
  return Math.max(0, expiresAt - (clientNow + offset));
}

/** When to refetch: just after the earliest code expires (+100ms slack), never faster than 250ms. */
export function nextRefreshDelay(codes: CodeItem[], serverTime: number, _clientNow?: number): number {
  if (!codes.length) return 30_000;
  const earliest = Math.min(...codes.map(c => c.expiresAt));
  return Math.max(250, earliest - serverTime + 100);
}

export function formatCode(code: string): string {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return code;
}

const PALETTE = ['#7c5cff', '#e5484d', '#12a594', '#f76b15', '#3e63dd', '#d6409f', '#0090ff', '#46a758'];
export function avatarColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

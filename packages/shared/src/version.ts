const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v.trim()) ? v.trim().split('.').map(Number) : null);

/** True when `current` is below `min` (dotted numeric versions). Unparseable input never blocks the user. */
export function isOutdated(current: string, min: string): boolean {
  const a = parse(current), b = parse(min);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { CodeItem } from '@auth/shared';
import { api } from './api';

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

export function useCodes(enabled: boolean) {
  const q = useQuery({
    queryKey: ['codes'],
    enabled,
    queryFn: async () => {
      const r = await api.codes();
      return { ...r, offset: r.serverTime - Date.now(), fetchedAt: Date.now() };
    },
    refetchInterval: d => (d.state.data ? nextRefreshDelay(d.state.data.codes, d.state.data.serverTime, d.state.data.fetchedAt) : false),
    refetchOnWindowFocus: true,
    gcTime: 0, // codes never linger in cache
  });
  const map = new Map((q.data?.codes ?? []).map(c => [c.entryId, c]));
  return { ...q, map, offset: q.data?.offset ?? 0 };
}

/** Re-render every second for countdowns. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set(x => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

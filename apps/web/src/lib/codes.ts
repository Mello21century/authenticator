import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { nextRefreshDelay } from '@auth/shared';
export { remainingMs, nextRefreshDelay } from '@auth/shared';
import { api } from './api';

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

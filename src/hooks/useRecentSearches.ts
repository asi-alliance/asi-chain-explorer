import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'asi-explorer-recent-searches-v1';
const MAX_RECENT = 6;

export interface RecentSearch {
  query: string;
  at: number;
}

function readRecent(): RecentSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is RecentSearch =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as RecentSearch).query === 'string' &&
        typeof (value as RecentSearch).at === 'number')
      .filter((value) => value.query.trim().length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function useRecentSearches() {
  const [recent, setRecent] = useState<RecentSearch[]>(readRecent);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // Storage can be unavailable in private or hardened contexts.
    }
  }, [recent]);

  const add = useCallback((query: string) => {
    const value = query.trim();
    if (!value) return;
    setRecent((previous) => [
      { query: value, at: Date.now() },
      ...previous.filter((item) => item.query.toLowerCase() !== value.toLowerCase()),
    ].slice(0, MAX_RECENT));
  }, []);

  const clear = useCallback(() => setRecent([]), []);

  return { recent, add, clear };
}

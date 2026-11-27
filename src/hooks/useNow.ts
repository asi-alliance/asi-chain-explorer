import { useEffect, useState } from 'react';

// Current time that updates at a fixed interval, for "age" labels that must
// change while the data stays the same.
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

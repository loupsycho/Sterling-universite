import { useEffect, useState } from 'react';
import { initDiscordSdk, isRunningInsideDiscord } from '@/lib/discord';

export type DiscordStatus = 'browser' | 'connecting' | 'ready' | 'error';

export function useDiscordActivity() {
  const [status, setStatus] = useState<DiscordStatus>('browser');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isRunningInsideDiscord()) {
      setStatus('browser');
      return;
    }

    let cancelled = false;
    setStatus('connecting');

    initDiscordSdk()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return { status, retry };
}

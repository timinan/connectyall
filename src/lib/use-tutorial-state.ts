'use client';

import { useCallback, useEffect, useState } from 'react';

export type TutorialState = {
  tutorialCompletedAt: string | null;
  displayNameSet: boolean;
  connectionsCount: number;
};

type Hook = {
  loading: boolean;
  state: TutorialState | null;
  completed: boolean;
  complete: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useTutorialState(): Hook {
  const [state, setState] = useState<TutorialState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/tutorial-state', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as TutorialState;
        setState(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const complete = useCallback(async () => {
    setState((s) => (s ? { ...s, tutorialCompletedAt: new Date().toISOString() } : s));
    await fetch('/api/tutorial-state', { method: 'POST' });
  }, []);

  return {
    loading,
    state,
    completed: Boolean(state?.tutorialCompletedAt),
    complete,
    refresh,
  };
}

// Per-step "dismissed in this session" flag. We don't persist to DB on
// dismiss (only on completion) — but we don't want a coach mark to bounce back
// if the user reloads the page mid-tutorial. SessionStorage gives us that.
export function useStepDismissed(stepKey: string) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(`tutorial_${stepKey}_dismissed`) === '1';
  });

  const dismiss = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`tutorial_${stepKey}_dismissed`, '1');
    }
    setDismissed(true);
  }, [stepKey]);

  return [dismissed, dismiss] as const;
}

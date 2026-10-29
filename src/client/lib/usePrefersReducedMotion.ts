import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  try {
    return Boolean(window.matchMedia(REDUCED_MOTION_QUERY)?.matches);
  } catch {
    return false;
  }
}

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(
    readPrefersReducedMotion,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    let mediaQuery: MediaQueryList | null = null;
    try {
      mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    } catch {
      return;
    }

    if (!mediaQuery) {
      return;
    }

    setPrefersReducedMotion(Boolean(mediaQuery.matches));

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(Boolean(event.matches));
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery?.removeEventListener('change', handleChange);
      };
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => {
        mediaQuery?.removeListener(handleChange);
      };
    }

    return undefined;
  }, []);

  return prefersReducedMotion;
}

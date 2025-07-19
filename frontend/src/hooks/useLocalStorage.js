// src/hooks/useLocalStorage.js
import { useState, useEffect, useCallback } from 'react';

/**
 * A resilient localStorage-backed state hook.
 *
 * Usage:
 *   const [theme, setTheme, clearTheme] = useLocalStorage('theme', 'light');
 *
 * - Reads once on mount (lazy initializer)
 * - Writes on state change
 * - JSON serializes values
 * - No‑op on SSR / unavailable window
 * - Returns a clear() function that resets to defaultValue AND removes key
 */
export function useLocalStorage(key, defaultValue) {
  // Lazy read
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Persist on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [key, value]);

  // Optional convenience to reset + remove key
  const clear = useCallback(() => {
    setValue(defaultValue);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key, defaultValue]);

  return [value, setValue, clear];
}

// Allow default import OR named import
export default useLocalStorage;

import { useEffect, useState } from "react";

/**
 * The debounced mirror of a fast-changing value — the search field's buffer.
 * The value lands only after `delay` milliseconds of silence, so typing
 * "mercado" fires one request, not seven.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debounced;
}

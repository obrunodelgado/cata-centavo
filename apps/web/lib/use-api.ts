import { useCallback, useEffect, useRef, useState } from "react";

export type UseApiResult<T> = {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  /** Re-runs the fetch with the latest fetcher; referentially stable. */
  readonly refetch: () => void;
};

/**
 * The reactive fetch every view uses for its first page. The fetcher lives in
 * a ref refreshed on every render, so callers may pass inline closures and
 * `refetch` stays referentially stable — without it, each render would
 * recreate the fetcher and the effect below would loop forever. The `key`
 * decides when a fetch happens; the closure only decides what it fetches.
 */
export function useApi<T>(key: string, fetch: () => Promise<T>): UseApiResult<T> {
  const fetchRef = useRef(fetch);
  useEffect(() => {
    fetchRef.current = fetch;
  });

  const [state, setState] = useState<{ readonly data: T | null; readonly error: string | null; readonly loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ data: current.data, error: null, loading: true }));
    fetchRef.current().then(
      (data) => {
        if (!cancelled) {
          setState({ data, error: null, loading: false });
        }
      },
      (reason: unknown) => {
        if (!cancelled) {
          setState({ data: null, error: reason instanceof Error ? reason.message : String(reason), loading: false });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  return { data: state.data, error: state.error, loading: state.loading, refetch };
}

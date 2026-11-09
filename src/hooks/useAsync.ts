import { type DependencyList, useEffect, useState } from "react";
import { useGeneration } from "./useGeneration";

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

interface Settled<T> {
  token: object;
  data: T | null;
  error: Error | null;
}

/**
 * Runs an abortable async task whenever `deps` change. Stale results are
 * discarded and the previous data is kept while a new request is in flight;
 * `loading` is derived by comparing the settled request with the current one.
 */
export function useAsync<T>(task: ((signal: AbortSignal) => Promise<T>) | null, deps: DependencyList): AsyncState<T> {
  const token = useGeneration(deps);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const enabled = task !== null;

  useEffect(() => {
    if (!task) return;
    const controller = new AbortController();
    task(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSettled({ token, data, error: null });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setSettled((prev) => ({
          token,
          data: prev?.data ?? null,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      },
    );
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per request generation
  }, [token]);

  if (!enabled) return { data: null, error: null, loading: false };
  const current = settled?.token === token;
  return { data: settled?.data ?? null, error: current ? (settled.error ?? null) : null, loading: !current };
}

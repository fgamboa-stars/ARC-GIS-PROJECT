import { useEffect, useState } from "react";
import { type AnalysisFilters, type AnalysisRun, type AnalysisWindow, runAnalysis } from "../analysis/pipeline";
import { queryFootprint } from "../analysis/smokeOverlay";
import { fetchTractsInFootprint } from "../data/tracts";
import type { Conditions, Tract } from "../types/domain";
import { useAsync } from "./useAsync";
import { useGeneration } from "./useGeneration";

interface TractSet {
  tracts: Tract[];
  truncated: boolean;
}

/** Tract sets are cached per data set so switching between replay events is instant. */
const tractCache = new Map<string, TractSet>();

function cacheKey(c: Conditions): string {
  return c.mode === "replay" ? `replay:${c.label}:${c.referenceTime.toString()}` : `live:${c.fetchedAt.toString()}`;
}

/**
 * Fetches every populated tract touched by any smoke zone in the data set
 * (all forecast hours), once. Changing the forecast window, threshold or
 * filters then only re-runs the in-memory overlay.
 */
export function useSmokeTracts(conditions: Conditions | null) {
  return useAsync<TractSet>(
    conditions
      ? async (signal) => {
          const key = cacheKey(conditions);
          const cached = tractCache.get(key);
          if (cached) return cached;
          const footprint = queryFootprint(conditions.smoke);
          const set = footprint ? await fetchTractsInFootprint(footprint, signal) : { tracts: [], truncated: false };
          if (conditions.mode === "live") {
            for (const k of tractCache.keys()) if (k.startsWith("live:")) tractCache.delete(k);
          }
          tractCache.set(key, set);
          return set;
        }
      : null,
    [conditions],
  );
}

export function useExposureAnalysis(
  conditions: Conditions | null,
  tractSet: TractSet | null,
  window: AnalysisWindow | null,
  filters: AnalysisFilters,
): { run: AnalysisRun | null; computing: boolean; error: Error | null } {
  const windowKind = window?.kind;
  const windowStart = window?.start;
  const ready = conditions !== null && tractSet !== null && windowKind !== undefined && windowStart !== undefined;
  const token = useGeneration([conditions, tractSet, windowKind, windowStart, filters]);
  const [settled, setSettled] = useState<{ token: object; run: AnalysisRun | null; error: Error | null } | null>(null);

  useEffect(() => {
    if (!conditions || !tractSet || windowKind === undefined || windowStart === undefined) return;
    // Debounced and deferred so slider drags stay responsive.
    const id = setTimeout(() => {
      try {
        const run = runAnalysis({
          conditions,
          tracts: tractSet.tracts,
          truncated: tractSet.truncated,
          window: { kind: windowKind, start: windowStart },
          filters,
        });
        setSettled({ token, run, error: null });
      } catch (err) {
        setSettled((prev) => ({
          token,
          run: prev?.run ?? null,
          error: err instanceof Error ? err : new Error("Analysis failed"),
        }));
      }
    }, 120);
    return () => {
      clearTimeout(id);
    };
  }, [token, conditions, tractSet, windowKind, windowStart, filters]);

  if (!ready) return { run: null, computing: false, error: null };
  // Keep showing the previous run for the same data set while recomputing.
  const run = settled?.run && settled.run.conditions === conditions ? settled.run : null;
  return { run, computing: settled?.token !== token, error: settled?.token === token ? settled.error : null };
}

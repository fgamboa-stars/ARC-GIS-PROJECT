import { useEffect } from "react";
import { fetchLiveConditions, fetchReplayIndex, fetchSnapshot, snapshotToConditions } from "../data/conditionsSource";
import type { Conditions } from "../types/domain";
import type { ConditionsSnapshot, SnapshotIndexEntry } from "../types/snapshot";
import { useAppState, useDispatch } from "../state/context";
import { useAsync } from "./useAsync";

const LIVE_REFRESH_MS = 15 * 60 * 1000;

export interface ConditionsState {
  conditions: Conditions | null;
  snapshot: ConditionsSnapshot | null;
  replayIndex: SnapshotIndexEntry[];
  loading: boolean;
  error: Error | null;
}

/** Loads conditions for the active mode (live services or a replay snapshot). */
export function useConditions(): ConditionsState {
  const { mode, replayId, uploadedSnapshot, refreshToken } = useAppState();
  const dispatch = useDispatch();

  const index = useAsync((signal) => fetchReplayIndex(signal), []);
  const entry = index.data?.find((e) => e.id === replayId) ?? index.data?.[0] ?? null;

  const live = useAsync(mode === "live" ? (signal) => fetchLiveConditions(signal) : null, [mode, refreshToken]);

  const replay = useAsync<{ snapshot: ConditionsSnapshot; conditions: Conditions }>(
    mode !== "replay"
      ? null
      : async (signal) => {
          const snapshot = uploadedSnapshot ?? (entry ? await fetchSnapshot(entry, signal) : null);
          if (!snapshot) throw index.error ?? new Error("No replay snapshots are available.");
          return { snapshot, conditions: snapshotToConditions(snapshot) };
        },
    [mode, entry?.id, uploadedSnapshot, index.error],
  );

  // Live data auto-refreshes.
  useEffect(() => {
    if (mode !== "live") return;
    const id = window.setInterval(() => {
      dispatch({ type: "refresh" });
    }, LIVE_REFRESH_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [mode, dispatch]);

  const active = mode === "live" ? live : replay;
  return {
    conditions: mode === "live" ? live.data : (replay.data?.conditions ?? null),
    snapshot: mode === "replay" ? (replay.data?.snapshot ?? null) : null,
    replayIndex: index.data ?? [],
    loading: active.loading || (mode === "replay" && index.loading && !uploadedSnapshot),
    error: active.error,
  };
}

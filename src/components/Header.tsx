import { useRef, useState } from "react";
import { captureSnapshot, downloadJson, readSnapshotFile } from "../data/conditionsSource";
import type { Theme } from "../hooks/useTheme";
import { useAppState, useDispatch } from "../state/context";
import type { Conditions } from "../types/domain";
import type { SnapshotIndexEntry } from "../types/snapshot";
import { formatDateTime } from "../utils/format";
import { IconButton, Segmented, Spinner } from "./ui/primitives";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  conditions: Conditions | null;
  replayIndex: SnapshotIndexEntry[];
  busy: string | null;
  onError: (message: string) => void;
}

export function Header({ theme, onToggleTheme, conditions, replayIndex, busy, onError }: Props) {
  const state = useAppState();
  const dispatch = useDispatch();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const activeReplay = state.uploadedSnapshot ? "__file" : (state.replayId ?? replayIndex[0]?.id ?? "");

  const save = async () => {
    if (!conditions || state.smokeTime === null) return;
    setSaving(true);
    try {
      const snap = await captureSnapshot(conditions, state.smokeTime);
      downloadJson(`${snap.id}.json`, snap);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save snapshot.");
    } finally {
      setSaving(false);
    }
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    try {
      dispatch({ type: "loadSnapshot", snapshot: await readSnapshotFile(file) });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not read snapshot.");
    }
  };

  return (
    <header className="app-header">
      <div className="brand">
        <h1>Who’s Breathing Wildfire Smoke Right Now?</h1>
        <p>
          {state.mode === "live"
            ? conditions
              ? `Live · Living Atlas · updated ${formatDateTime(conditions.fetchedAt, { weekday: undefined })}`
              : "Live · ArcGIS Living Atlas"
            : "Replay · historical smoke events"}
        </p>
      </div>

      <div className="header-controls">
        {busy && <Spinner label={busy} />}
        <Segmented
          label="Data mode"
          value={state.mode}
          options={[
            { value: "live", label: "Live" },
            { value: "replay", label: "Replay" },
          ]}
          onChange={(mode) => {
            dispatch({ type: "setMode", mode });
          }}
        />

        {state.mode === "replay" && (
          <label className="select">
            <span className="visually-hidden">Replay event</span>
            <select
              value={activeReplay}
              onChange={(e) => {
                if (e.target.value !== "__file") dispatch({ type: "setReplay", id: e.target.value });
              }}
            >
              {replayIndex.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.subtitle} — {e.title}
                </option>
              ))}
              {state.uploadedSnapshot && <option value="__file">{state.uploadedSnapshot.title} (file)</option>}
            </select>
          </label>
        )}

        {state.mode === "live" ? (
          <>
            <IconButton
              icon="download"
              label={saving ? "Saving snapshot…" : "Save snapshot of current conditions"}
              onClick={() => void save()}
              disabled={!conditions || saving}
            />
            <IconButton
              icon="refresh"
              label="Refresh live data"
              onClick={() => {
                dispatch({ type: "refresh" });
              }}
            />
          </>
        ) : (
          <IconButton icon="upload" label="Load a saved snapshot file" onClick={() => fileInput.current?.click()} />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <IconButton
          icon={theme === "dark" ? "sun" : "moon"}
          label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          onClick={onToggleTheme}
        />
      </div>
    </header>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CommunityPanel } from "./components/CommunityPanel";
import { Header } from "./components/Header";
import { LayersTab } from "./components/LayersTab";
import { MapLegend } from "./components/MapLegend";
import { OverviewTab } from "./components/OverviewTab";
import { RankingsTab } from "./components/RankingsTab";
import { TimeControl } from "./components/TimeControl";
import { IconButton, Notice } from "./components/ui/primitives";
import { useCommunity } from "./hooks/useCommunity";
import { useConditions } from "./hooks/useConditions";
import { useExposureAnalysis, useSmokeTracts } from "./hooks/useExposureAnalysis";
import { useTheme } from "./hooks/useTheme";
import { useMapLayers } from "./map/useMapLayers";
import { useMapView } from "./map/useMapView";
import { type SidebarTab, analysisWindow } from "./state/appState";
import { useAppState, useDispatch } from "./state/context";
import type { CommunityRank } from "./types/domain";

const TABS: readonly { id: SidebarTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "rankings", label: "Top communities" },
  { id: "layers", label: "Layers & filters" },
];

function nearest(times: readonly number[], target: number): number | null {
  let best: number | null = null;
  for (const t of times) if (best === null || Math.abs(t - target) < Math.abs(best - target)) best = t;
  return best;
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const state = useAppState();
  const dispatch = useDispatch();
  const [toast, setToast] = useState<string | null>(null);

  const { conditions, snapshot, replayIndex, loading, error } = useConditions();
  const tracts = useSmokeTracts(conditions);
  const analysisWin = analysisWindow(state);
  const analysis = useExposureAnalysis(conditions, tracts.data, analysisWin, state.filters);
  const community = useCommunity(state.selectedGeoid, analysis.run);

  // Default the forecast hour to "now" (live) or the snapshot time (replay).
  useEffect(() => {
    if (!conditions || state.smokeTime !== null) return;
    const t = conditions.mode === "live" ? nearest(conditions.smokeTimes, Date.now()) : conditions.referenceTime;
    if (t !== null) dispatch({ type: "setSmokeTime", time: t });
  }, [conditions, state.smokeTime, dispatch]);

  const { containerRef, view } = useMapView(theme);
  const onSelect = useCallback(
    (geoid: string | null) => {
      dispatch({ type: "select", geoid });
    },
    [dispatch],
  );
  useMapLayers(view, {
    mode: state.mode,
    raw: conditions?.mode === "replay" ? conditions.raw : null,
    theme,
    settings: state.layers,
    filters: state.filters,
    smokeTime: state.smokeTime,
    tractShading: state.tractShading,
    run: analysis.run,
    minRisk: state.minRiskCategory,
    selectedGeoid: state.selectedGeoid,
    onSelect,
  });

  // Frame the event when a replay snapshot loads; reset to the continent for live.
  useEffect(() => {
    if (!view) return;
    const target = snapshot?.view
      ? { center: snapshot.view.center, zoom: snapshot.view.zoom }
      : state.mode === "live"
        ? { center: [-97, 42], zoom: 4 }
        : null;
    if (target) view.goTo(target, { duration: 600 }).catch(() => undefined);
  }, [view, snapshot, state.mode]);

  const zoomTo = useCallback(
    (lon: number, lat: number, zoom = 10) => {
      view?.goTo({ center: [lon, lat], zoom }, { duration: 500 }).catch(() => undefined);
    },
    [view],
  );
  const focusRank = (r: CommunityRank) => {
    zoomTo(r.lon, r.lat, r.geoid ? 11 : 8);
    if (r.geoid) dispatch({ type: "select", geoid: r.geoid });
  };

  const busy = loading
    ? state.mode === "live"
      ? "Loading Living Atlas layers…"
      : "Loading snapshot…"
    : tracts.loading
      ? "Querying census tracts…"
      : analysis.computing
        ? "Running overlay…"
        : null;
  const fatal = error ?? tracts.error ?? analysis.error;

  return (
    <div className={`app ${state.selectedGeoid ? "has-detail" : ""}`}>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        conditions={conditions}
        replayIndex={replayIndex}
        busy={busy}
        onError={setToast}
      />

      <div className="app-body">
        <aside className="sidebar" aria-label="Analysis">
          <nav className="tabs" role="tablist" aria-label="Dashboard sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`tab-${t.id}`}
                aria-selected={state.tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={state.tab === t.id ? "is-active" : undefined}
                onClick={() => {
                  dispatch({ type: "setTab", tab: t.id });
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div
            className="sidebar__scroll"
            role="tabpanel"
            id={`panel-${state.tab}`}
            aria-labelledby={`tab-${state.tab}`}
          >
            {fatal && (
              <Notice
                tone="error"
                action={
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => {
                      dispatch({ type: "refresh" });
                    }}
                  >
                    Retry
                  </button>
                }
              >
                {fatal.message}
              </Notice>
            )}
            {state.tab === "overview" && (
              <OverviewTab conditions={conditions} result={analysis.run?.result ?? null} loading={busy !== null} />
            )}
            {state.tab === "rankings" && <RankingsTab result={analysis.run?.result ?? null} onFocus={focusRank} />}
            {state.tab === "layers" && <LayersTab />}
          </div>
        </aside>

        <main className="map-area">
          <div ref={containerRef} className="map" aria-label="Wildfire smoke map" />
          <div className="map-overlay map-overlay--bottom">
            <TimeControl conditions={conditions} snapshot={snapshot} />
          </div>
          <div className="map-overlay map-overlay--legend">
            <MapLegend />
          </div>
          {busy && <div className="map-progress" aria-hidden="true" />}
        </main>

        {state.selectedGeoid && (
          <CommunityPanel
            detail={community.data}
            loading={community.loading}
            error={community.error}
            smokeKind={conditions?.smokeKind ?? "forecast"}
            onClose={() => {
              dispatch({ type: "select", geoid: null });
            }}
            onZoom={(lon, lat) => {
              zoomTo(lon, lat);
            }}
          />
        )}
      </div>

      {toast && (
        <div className="toast" role="alert">
          <span>{toast}</span>
          <IconButton
            icon="close"
            label="Dismiss"
            onClick={() => {
              setToast(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

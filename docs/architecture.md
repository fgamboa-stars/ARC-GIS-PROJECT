# Architecture

The application is a static single-page app. All analysis runs in the browser against public ArcGIS feature services; there is no backend.

## System overview

```
┌───────────────────────────── Browser ─────────────────────────────┐
│                                                                    │
│  React UI (components/)          ArcGIS MapView (map/)             │
│   Header · Sidebar tabs           Living Atlas FeatureLayers        │
│   Community panel · Time control  Client-side replay layers         │
│          ▲                        Risk points · footprint           │
│          │ state (state/)                ▲                          │
│          │                               │ map/sync.ts              │
│  Hooks (hooks/)  ────────────────────────┘                          │
│   useConditions → useSmokeTracts → useExposureAnalysis → useCommunity│
│          │                 │                 │                      │
│          ▼                 ▼                 ▼                      │
│  Data (data/)         Data (data/)     Analysis engine (analysis/)  │
│   conditionsSource     tracts.ts         smokeOverlay (geometry ops)│
│   normalize.ts         arcgisRest.ts     riskScore · exposure       │
│                                          rankings · insights        │
└──────────┬──────────────────┬──────────────────────────────────────┘
           │ REST /query       │ static JSON
           ▼                   ▼
  ArcGIS Living Atlas      public/replay/*.json
  feature services         (built by scripts/build_replay_snapshot.py)
```

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/config/` | Service registry, smoke scale, risk weights, AQI and region lookups. The single place for URLs, field names and tunable parameters. |
| `src/types/` | Domain types (`Conditions`, `Tract`, `TractAssessment`, `AnalysisResult`) and the snapshot schema with runtime validation. |
| `src/data/` | REST client (`queryAll`: paging, `resultType=standard`, POSTed geometry, parallel pages), live and replay loaders, normalization of Living Atlas attributes into domain objects. |
| `src/analysis/` | Analysis engine. Pure modules (`geo`, `riskScore`, `exposure`, `rankings`, `stationComparison`, `insights`) plus `smokeOverlay`, which wraps the ArcGIS geometry operators. `pipeline.ts` orchestrates a run. |
| `src/map/` | Layer registry and factory, renderers, popups, `useMapView`, `useMapLayers`, and `sync.ts` (all imperative SDK mutation). |
| `src/hooks/` | Data and analysis lifecycle hooks with cancellation and loading states. |
| `src/state/` | Reducer-based app state (mode, window, filters, layer settings, selection) exposed through context. |
| `src/components/` | Presentational components. |
| `scripts/` | Offline builder for replay snapshots. |

## Data flow

1. **Conditions.** `useConditions` loads a `Conditions` object for the active mode.
   - *Live*: `fetchLiveConditions` queries six Living Atlas layers in parallel (smoke ≥ Light for all 48 forecast hours, U.S. and Canadian incidents, North American hotspots, AirNow monitors). A failing layer becomes a warning rather than an error. Data refreshes every 15 minutes.
   - *Replay*: a snapshot JSON is fetched (or read from a user file) and validated.
   - Both paths produce `RawLayers`, features in the **native Living Atlas field schemas**, and pass through the same `buildConditions` normalizer.
2. **Tracts.** `useSmokeTracts` dissolves every smoke zone in the data set, buffers and generalizes it, then queries the ACS tract layer once for all intersecting tracts (attributes plus centroid, no geometry). Results are cached per data set.
3. **Analysis.** `useExposureAnalysis` calls `runAnalysis` whenever the window, threshold or filters change. Because tracts are already in memory, this is a client-side recomputation (typically 0.3–3 s).
4. **Presentation.** Results drive the KPI cards, severity and risk distributions, findings, rankings, the risk-point layer and the analysis-footprint layer. `useCommunity` serves the detail panel. Exposed tracts come straight from the run; any other clicked tract is fetched and scored on demand with the same footprint and context.

## Layer relationships

| Layer | Live source | Replay source | Feeds analysis |
| --- | --- | --- | --- |
| Smoke | NDGD Smoke Forecast (hour filter via `definitionExpression`) | HMS polygons mapped to the same classes | Smoke footprint → smoke level per tract |
| U.S. / Canadian incidents | USA_Wildfires_v1 layers 0 / 2 | WFIGS incidents / HMS hotspot clusters | Fire proximity and count |
| Perimeters | USA_Wildfires_v1 layers 1 / 3 | — (when saved from live) | Display only |
| Hotspots | VIIRS layer (`hours_old` filter) | HMS fire detections | Hotspot density |
| PM2.5 monitors | AirNow current | AirNow daily averages | PM2.5 interpolation; observed vs forecast |
| AQI surface | AirNow contours | — | Display only |
| Census tracts | ACS tracts (display ≥ 1:3M) | same | Population, children, seniors, density |
| Risk points | Client layer from the analysis | same | Output |
| Analysis footprint | Graphics from the dissolved zones | same | Output |

Because replay features keep Living Atlas field names, renderers, popups and normalization are shared. `createLayers` only decides between a URL-backed `FeatureLayer` and a client-side `FeatureLayer` built from snapshot graphics.

## Analysis process (summary)

`runAnalysis` → select zones in the window → dissolve per level (`SmokeFootprint`) → build grid indexes of filtered fires, hotspots and monitors → for each tract, compute smoke level (accelerated `contains`), factors and score → aggregate totals → compare monitors with the expected smoke band → generate findings. Full details are in [analysis-methodology.md](analysis-methodology.md).

## Key design decisions

- **REST client instead of `queryFeatures` for bulk reads.** The ACS tract service caps standard SDK queries at 50 records per page; `resultType=standard` raises that to 16,000–32,000 for attribute-only queries, so a national-scale tract set loads in about 10 seconds with four parallel pages.
- **Query once, recompute locally.** Tracts are fetched for the union of *all* forecast hours, so moving the time slider or changing filters never triggers another tract query.
- **Dissolve by level, then accelerate.** Hundreds of hourly forecast polygons collapse into at most four dissolved polygons, so classifying a tract costs at most four `contains` checks.
- **Pure analysis core.** Everything except the geometry overlay is plain TypeScript with unit tests. The overlay itself is exercised in Node against a real replay snapshot.
- **Imperative SDK code is isolated in `map/sync.ts`.** React state never holds mutated SDK objects, which keeps hooks declarative and satisfies the React Hooks lint rules.
- **Monochrome UI, color for data only.** Smoke uses a neutral lightness ramp, risk a single-hue ordinal ramp, monitors the official EPA AQI colors. Every color also carries a text label.

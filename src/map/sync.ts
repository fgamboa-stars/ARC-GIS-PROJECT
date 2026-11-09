import Basemap from "@arcgis/core/Basemap";
import Graphic from "@arcgis/core/Graphic";
import type Geometry from "@arcgis/core/geometry/Geometry";
import Polygon from "@arcgis/core/geometry/Polygon";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type GroupLayer from "@arcgis/core/layers/GroupLayer";
import VectorTileLayer from "@arcgis/core/layers/VectorTileLayer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import type MapView from "@arcgis/core/views/MapView";
import type { AnalysisFilters, AnalysisRun } from "../analysis/pipeline";
import { footprintToJSON } from "../analysis/smokeOverlay";
import { RISK_ORDER, type RiskCategory } from "../config/risk";
import { BASEMAPS, SERVICES } from "../config/services";
import type { Theme } from "../hooks/useTheme";
import type { LayerSetting } from "../state/appState";
import type { Mode } from "../types/domain";
import { type LayerId, type MapLayer, createRiskLayer } from "./layers";
import {
  fireRenderer,
  footprintSymbol,
  perimeterRenderer,
  smokeRenderer,
  stationRenderer,
  type TractShading,
  tractRenderer,
} from "./symbology";

/**
 * Imperative synchronization between application state and ArcGIS SDK
 * objects. Hooks call these from effects; keeping mutation here keeps the
 * React layer declarative.
 */

export type LayerMap = Record<LayerId, MapLayer>;

const sqlTime = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const and = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(" AND ") || "1=1";

export function basemapFor(theme: Theme): Basemap {
  const ids = BASEMAPS[theme];
  return new Basemap({
    baseLayers: [new VectorTileLayer({ portalItem: { id: ids.base } })],
    referenceLayers: [new VectorTileLayer({ portalItem: { id: ids.reference } })],
    title: theme === "dark" ? "Dark Gray Canvas" : "Light Gray Canvas",
  });
}

/** Swaps the basemap once the view is ready, so an in-flight basemap load is never aborted. */
export function setBasemap(view: MapView, theme: Theme): void {
  view
    .when()
    .then(() => {
      const map = view.map;
      if (!map || view.destroyed) return;
      const title = theme === "dark" ? "Dark Gray Canvas" : "Light Gray Canvas";
      if (map.basemap?.title !== title) map.basemap = basemapFor(theme);
    })
    .catch(() => undefined);
}

export function applyLayerSettings(layers: LayerMap, settings: Record<LayerId, LayerSetting>, mode: Mode): void {
  for (const [id, layer] of Object.entries(layers) as [LayerId, MapLayer][]) {
    layer.visible = settings[id].visible && !(id === "aqiContours" && mode === "replay");
    layer.opacity = settings[id].opacity;
  }
}

export function applyFilters(layers: LayerMap, f: AnalysisFilters, smokeTime: number | null, mode: Mode): void {
  (layers.usFires as FeatureLayer).definitionExpression = and(
    SERVICES.usFires.where,
    f.minFireAcres > 0 && `DailyAcres >= ${f.minFireAcres.toString()}`,
    !f.includeContained && "(PercentContained IS NULL OR PercentContained < 100)",
  );
  (layers.caFires as FeatureLayer).definitionExpression = and(
    mode === "live" && SERVICES.caFires.where,
    f.minFireAcres > 0 && `fire_size >= ${(f.minFireAcres / 2.47105).toFixed(1)}`,
  );
  (layers.hotspots as FeatureLayer).definitionExpression = `hours_old <= ${f.hotspotMaxAgeHours.toString()}`;
  if (mode === "live" && smokeTime !== null) {
    (layers.smoke as FeatureLayer).definitionExpression = `todate = timestamp '${sqlTime(smokeTime)}'`;
  }
}

export function applyRenderers(layers: LayerMap, theme: Theme, shading: TractShading): void {
  (layers.smoke as FeatureLayer).renderer = smokeRenderer(theme);
  (layers.stations as FeatureLayer).renderer = stationRenderer(theme);
  (layers.usFires as FeatureLayer).renderer = fireRenderer(theme, "US");
  (layers.caFires as FeatureLayer).renderer = fireRenderer(theme, "CA");
  (layers.tracts as FeatureLayer).renderer = tractRenderer(theme, shading);
  (layers.perimeters as GroupLayer).layers.forEach((l) => {
    (l as FeatureLayer).renderer = perimeterRenderer(theme);
  });
}

export function drawAnalysis(layers: LayerMap, run: AnalysisRun | null, theme: Theme, minRisk: RiskCategory): void {
  const footprint = layers.footprint as GraphicsLayer;
  const risk = layers.risk as GroupLayer;
  footprint.removeAll();
  risk.removeAll();
  if (!run) return;
  footprint.addMany(
    footprintToJSON(run.footprint).map(
      ({ level, geometry }) =>
        new Graphic({
          geometry: new Polygon({ rings: geometry.rings, spatialReference: { wkid: 4326 } }),
          symbol: footprintSymbol(theme, level),
        }),
    ),
  );
  risk.add(createRiskLayer(run.result.assessments, theme, RISK_ORDER.indexOf(minRisk)));
}

export function drawSelection(layer: GraphicsLayer, geometry: Geometry | null, theme: Theme): void {
  layer.removeAll();
  if (!geometry) return;
  layer.add(
    new Graphic({
      geometry,
      symbol: new SimpleFillSymbol({
        color: [0, 0, 0, 0],
        outline: { color: theme === "dark" ? [255, 255, 255, 1] : [0, 0, 0, 1], width: 2.5 },
      }),
    }),
  );
}

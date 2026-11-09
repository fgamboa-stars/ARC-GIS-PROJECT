import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type MapView from "@arcgis/core/views/MapView";
import { useEffect, useEffectEvent, useMemo } from "react";
import type { AnalysisFilters, AnalysisRun } from "../analysis/pipeline";
import type { RiskCategory } from "../config/risk";
import { TRACT_FIELDS } from "../config/services";
import type { Theme } from "../hooks/useTheme";
import type { LayerSetting } from "../state/appState";
import type { Mode, RawLayers } from "../types/domain";
import { DRAW_ORDER, type LayerId, createLayers } from "./layers";
import { applyFilters, applyLayerSettings, applyRenderers, drawAnalysis, drawSelection } from "./sync";
import type { TractShading } from "./symbology";

interface Options {
  mode: Mode;
  raw: RawLayers | null;
  theme: Theme;
  settings: Record<LayerId, LayerSetting>;
  filters: AnalysisFilters;
  smokeTime: number | null;
  tractShading: TractShading;
  run: AnalysisRun | null;
  minRisk: RiskCategory;
  selectedGeoid: string | null;
  onSelect: (geoid: string | null) => void;
}

/** Keeps the map's operational layers in sync with application state. */
export function useMapLayers(view: MapView | null, o: Options): void {
  // Layer objects depend only on the data source; everything else is applied in place.
  const layers = useMemo(() => createLayers(o.mode, o.mode === "replay" ? o.raw : null, "light"), [o.mode, o.raw]);
  const selection = useMemo(() => new GraphicsLayer({ id: "selection", listMode: "hide" }), []);
  const select = useEffectEvent((geoid: string) => {
    o.onSelect(geoid);
  });

  useEffect(() => {
    const map = view?.map;
    if (!map) return;
    const all = [...DRAW_ORDER.map((id) => layers[id]), selection];
    map.addMany(all);
    return () => {
      map.removeMany(all);
    };
  }, [view, layers, selection]);

  useEffect(() => {
    applyLayerSettings(layers, o.settings, o.mode);
  }, [layers, o.settings, o.mode]);

  useEffect(() => {
    applyFilters(layers, o.filters, o.smokeTime, o.mode);
  }, [layers, o.filters, o.smokeTime, o.mode]);

  useEffect(() => {
    applyRenderers(layers, o.theme, o.tractShading);
  }, [layers, o.theme, o.tractShading]);

  useEffect(() => {
    drawAnalysis(layers, o.run, o.theme, o.minRisk);
  }, [layers, o.run, o.theme, o.minRisk]);

  // Click → select a tract from the risk points or the tract polygons.
  useEffect(() => {
    if (!view) return;
    const handle = view.on("click", (event) => {
      void view.hitTest(event).then((res) => {
        const first = res.results.find((r) => r.type === "graphic");
        if (first?.type !== "graphic") return;
        const layer = first.layer as { id?: string; parent?: { id?: string } } | null;
        const attrs = first.graphic.attributes as Record<string, unknown> | null;
        const geoid = attrs?.[TRACT_FIELDS.id];
        if ((layer?.id === "tracts" || layer?.parent?.id === "risk") && typeof geoid === "string") select(geoid);
      });
    });
    return () => {
      handle.remove();
    };
  }, [view]);

  // Selected-tract outline.
  useEffect(() => {
    drawSelection(selection, null, o.theme);
    if (!o.selectedGeoid) return;
    const controller = new AbortController();
    (layers.tracts as FeatureLayer)
      .queryFeatures(
        {
          where: `${TRACT_FIELDS.id} = '${o.selectedGeoid}'`,
          returnGeometry: true,
          outSpatialReference: { wkid: 4326 },
        },
        { signal: controller.signal },
      )
      .then((fs) => {
        drawSelection(selection, fs.features[0]?.geometry ?? null, o.theme);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
    };
  }, [layers, selection, o.selectedGeoid, o.theme]);
}

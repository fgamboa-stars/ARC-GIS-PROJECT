import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import FeatureLayer, { type FeatureLayerProperties } from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import GroupLayer from "@arcgis/core/layers/GroupLayer";
import type Field from "@arcgis/core/layers/support/Field";
import { SERVICES } from "../config/services";
import type { Theme } from "../hooks/useTheme";
import type { Mode, RawFeature, RawLayers, TractAssessment } from "../types/domain";
import { POPUPS } from "./popups";
import {
  aqiContourRenderer,
  fireRenderer,
  hotspotRenderer,
  perimeterRenderer,
  riskRenderer,
  smokeRenderer,
  stationRenderer,
  tractRenderer,
} from "./symbology";

/**
 * Map layer registry. In Live mode each data layer is a Living Atlas
 * FeatureLayer (server-side filtering, native popups). In Replay mode the same
 * layers are client-side FeatureLayers built from snapshot features that use
 * the same field schema, so renderers and popups are shared.
 */

export type LayerId =
  | "smoke"
  | "footprint"
  | "aqiContours"
  | "stations"
  | "perimeters"
  | "usFires"
  | "caFires"
  | "hotspots"
  | "risk"
  | "tracts";

export type LayerGroup = "Smoke & air quality" | "Wildfires" | "Communities";

export interface LayerDef {
  id: LayerId;
  title: string;
  group: LayerGroup;
  description: string;
  liveOnly?: boolean;
  defaultVisible: boolean;
  defaultOpacity: number;
}

/** Ordered top → bottom as listed in the UI; drawn in reverse. */
export const LAYER_DEFS: readonly LayerDef[] = [
  {
    id: "usFires",
    title: "Active U.S. wildfires",
    group: "Wildfires",
    description: SERVICES.usFires.title,
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: "caFires",
    title: "Active Canadian wildfires",
    group: "Wildfires",
    description: SERVICES.caFires.title,
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: "hotspots",
    title: "Satellite hotspots",
    group: "Wildfires",
    description: SERVICES.hotspots.title,
    defaultVisible: true,
    defaultOpacity: 0.9,
  },
  {
    id: "perimeters",
    title: "Fire perimeters",
    group: "Wildfires",
    description: "U.S. and Canada current perimeters",
    defaultVisible: true,
    defaultOpacity: 0.9,
  },
  {
    id: "stations",
    title: "PM2.5 monitors",
    group: "Smoke & air quality",
    description: SERVICES.stations.title,
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: "footprint",
    title: "Analysis footprint",
    group: "Smoke & air quality",
    description: "Dissolved smoke zones used for exposure",
    defaultVisible: false,
    defaultOpacity: 1,
  },
  {
    id: "smoke",
    title: "Smoke",
    group: "Smoke & air quality",
    description: "NWS smoke forecast (live) · NOAA HMS (replay)",
    defaultVisible: true,
    defaultOpacity: 1,
  },
  {
    id: "aqiContours",
    title: "AQI surface",
    group: "Smoke & air quality",
    description: SERVICES.aqiContours.title,
    liveOnly: true,
    defaultVisible: false,
    defaultOpacity: 0.7,
  },
  {
    id: "risk",
    title: "Exposed tracts by risk",
    group: "Communities",
    description: "Smoke Risk Score at tract centroids",
    defaultVisible: true,
    defaultOpacity: 0.9,
  },
  {
    id: "tracts",
    title: "Census tracts",
    group: "Communities",
    description: SERVICES.tracts.title,
    defaultVisible: true,
    defaultOpacity: 1,
  },
];

export type MapLayer = FeatureLayer | GraphicsLayer | GroupLayer;

const WGS84 = { wkid: 4326 };

/** Builds field definitions for a client-side layer from the snapshot's attributes. */
function inferFields(features: readonly RawFeature[]): Partial<Field>[] {
  const types = new Map<string, "string" | "double">();
  for (const f of features.slice(0, 200)) {
    for (const [k, v] of Object.entries(f.attributes)) {
      if (v === null || v === undefined) continue;
      if (!types.has(k) || types.get(k) === "double") types.set(k, typeof v === "number" ? "double" : "string");
    }
  }
  return [
    { name: "__oid", type: "oid" },
    ...[...types].filter(([k]) => k !== "__oid").map(([name, type]) => ({ name, type })),
  ] as Partial<Field>[];
}

function clientLayer(
  features: readonly RawFeature[],
  kind: "point" | "polygon",
  props: FeatureLayerProperties,
): FeatureLayer {
  const source = features
    .filter((f) => f.geometry !== null)
    .map(
      (f, i) =>
        new Graphic({
          attributes: { ...f.attributes, __oid: i + 1 },
          geometry:
            kind === "point"
              ? new Point({ ...(f.geometry as { x: number; y: number }), spatialReference: WGS84 })
              : new Polygon({ rings: (f.geometry as { rings: number[][][] }).rings, spatialReference: WGS84 }),
        }),
    );
  return new FeatureLayer({
    ...props,
    source,
    objectIdField: "__oid",
    fields: inferFields(features),
    geometryType: kind,
    spatialReference: WGS84,
  });
}

function dataLayer(
  mode: Mode,
  raw: RawLayers | null,
  key: keyof RawLayers,
  url: string,
  kind: "point" | "polygon",
  props: FeatureLayerProperties,
): FeatureLayer {
  if (mode === "replay" && raw) return clientLayer(raw[key], kind, props);
  return new FeatureLayer({ ...props, url, outFields: ["*"] });
}

export function createLayers(mode: Mode, raw: RawLayers | null, theme: Theme): Record<LayerId, MapLayer> {
  const perimeters: FeatureLayer[] =
    mode === "replay" && raw
      ? raw.perimeters.length
        ? [
            clientLayer(raw.perimeters, "polygon", {
              renderer: perimeterRenderer(theme),
              popupTemplate: POPUPS.perimeter,
            }),
          ]
        : []
      : [SERVICES.usPerimeters.url, SERVICES.caPerimeters.url].map(
          (url) =>
            new FeatureLayer({
              url,
              outFields: ["*"],
              renderer: perimeterRenderer(theme),
              popupTemplate: POPUPS.perimeter,
            }),
        );

  return {
    tracts: new FeatureLayer({
      id: "tracts",
      url: SERVICES.tracts.url,
      title: "Census tracts",
      outFields: ["GEOID", "NAME", "State", "County", "B01001_001E", "B01001_calc_pctLT18E", "B01001_calc_pctGE65E"],
      definitionExpression: SERVICES.tracts.where,
      renderer: tractRenderer(theme, "none"),
      minScale: 3_000_000,
      popupEnabled: false,
    }),
    smoke: dataLayer(mode, raw, "smoke", SERVICES.smoke.url, "polygon", {
      id: "smoke",
      title: "Smoke",
      renderer: smokeRenderer(theme),
      popupTemplate: POPUPS.smoke,
    }),
    aqiContours: new FeatureLayer({
      id: "aqiContours",
      url: SERVICES.aqiContours.url,
      title: "AQI surface",
      renderer: aqiContourRenderer(),
      popupEnabled: false,
    }),
    footprint: new GraphicsLayer({ id: "footprint", title: "Analysis footprint" }),
    perimeters: new GroupLayer({ id: "perimeters", title: "Fire perimeters", layers: perimeters }),
    risk: new GroupLayer({ id: "risk", title: "Exposed tracts by risk" }),
    stations: dataLayer(mode, raw, "stations", SERVICES.stations.url, "point", {
      id: "stations",
      title: "PM2.5 monitors",
      definitionExpression: SERVICES.stations.where,
      labelsVisible: false,
      renderer: stationRenderer(theme),
      popupTemplate: POPUPS.station,
    }),
    hotspots: dataLayer(mode, raw, "hotspots", SERVICES.hotspots.url, "point", {
      id: "hotspots",
      title: "Satellite hotspots",
      renderer: hotspotRenderer(),
      labelsVisible: false,
      popupTemplate: POPUPS.hotspot,
    }),
    usFires: dataLayer(mode, raw, "usFires", SERVICES.usFires.url, "point", {
      id: "usFires",
      title: "U.S. wildfires",
      renderer: fireRenderer(theme, "US"),
      popupTemplate: POPUPS.usFire,
    }),
    caFires: dataLayer(mode, raw, "caFires", SERVICES.caFires.url, "point", {
      id: "caFires",
      title: "Canadian wildfires",
      renderer: fireRenderer(theme, "CA"),
      popupTemplate: POPUPS.caFire,
    }),
  };
}

/** Draw order, bottom → top. */
export const DRAW_ORDER: readonly LayerId[] = [
  "aqiContours",
  "smoke",
  "tracts",
  "footprint",
  "perimeters",
  "risk",
  "stations",
  "hotspots",
  "caFires",
  "usFires",
];

/** Client-side point layer of exposed tract centroids, symbolized by risk category. */
export function createRiskLayer(
  assessments: readonly TractAssessment[],
  theme: Theme,
  minCategoryIndex: number,
): FeatureLayer {
  const order = ["Low", "Moderate", "High", "Extreme"];
  const source = assessments
    .filter((a) => order.indexOf(a.risk.category) >= minCategoryIndex)
    .map(
      (a, i) =>
        new Graphic({
          geometry: new Point({ x: a.tract.lon, y: a.tract.lat, spatialReference: WGS84 }),
          attributes: { oid: i + 1, GEOID: a.tract.geoid, category: a.risk.category, score: a.risk.total },
        }),
    );
  return new FeatureLayer({
    title: "Exposed tracts by risk",
    source,
    objectIdField: "oid",
    fields: [
      { name: "oid", type: "oid" },
      { name: "GEOID", type: "string" },
      { name: "category", type: "string" },
      { name: "score", type: "double" },
    ] as Field[],
    geometryType: "point",
    spatialReference: WGS84,
    renderer: riskRenderer(theme),
    // Tract points are legible from regional zoom inward; national totals live in the sidebar.
    minScale: 5_000_000,
    orderBy: [{ field: "score", order: "ascending" }],
    popupEnabled: false,
    outFields: ["*"],
  });
}

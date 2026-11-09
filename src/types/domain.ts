import type { RiskCategory } from "../config/risk";
import type { Region } from "../config/regions";
import type { ExposureLevel, SmokeLevel } from "../config/smoke";

/* ------------------------------------------------------------------ */
/* Raw layer data (Living Atlas schemas, shared by live and replay)    */
/* ------------------------------------------------------------------ */

export type Attributes = Record<string, string | number | boolean | null | undefined>;

export interface EsriPointJSON {
  x: number;
  y: number;
}
export interface EsriPolygonJSON {
  rings: number[][][];
}

export interface RawFeature<G = EsriPointJSON | EsriPolygonJSON | null> {
  attributes: Attributes;
  /** May be null in user-supplied snapshots; consumers must check. */
  geometry: G | null;
}

/** Layer keys that make up a "conditions" data set. Geometry is WGS84. */
export interface RawLayers {
  smoke: RawFeature<EsriPolygonJSON>[];
  usFires: RawFeature<EsriPointJSON>[];
  caFires: RawFeature<EsriPointJSON>[];
  perimeters: RawFeature<EsriPolygonJSON>[];
  hotspots: RawFeature<EsriPointJSON>[];
  stations: RawFeature<EsriPointJSON>[];
}
export type RawLayerKey = keyof RawLayers;

/* ------------------------------------------------------------------ */
/* Normalized conditions                                               */
/* ------------------------------------------------------------------ */

export type Mode = "live" | "replay";

export interface SmokeZone {
  id: number;
  level: SmokeLevel;
  /** Valid time (epoch ms) of the forecast hour or observation. */
  validTime: number;
  geometry: EsriPolygonJSON;
}

export interface FireIncident {
  id: string;
  name: string;
  country: "US" | "CA";
  jurisdiction: string | null;
  acres: number | null;
  percentContained: number | null;
  status: string | null;
  discovered: number | null;
  lon: number;
  lat: number;
}

export interface Hotspot {
  lon: number;
  lat: number;
  frp: number | null;
  hoursOld: number | null;
}

export interface AirStation {
  id: string;
  name: string;
  state: string | null;
  pm25: number | null;
  aqi: number | null;
  observedAt: number | null;
  lon: number;
  lat: number;
}

export interface Conditions {
  mode: Mode;
  /** Where smoke comes from: NWS forecast (live) or satellite analysis (replay). */
  smokeKind: "forecast" | "observed";
  label: string;
  /** Reference time for the data set (epoch ms). */
  referenceTime: number;
  /** Sorted, unique smoke valid times available. */
  smokeTimes: number[];
  smoke: SmokeZone[];
  fires: FireIncident[];
  hotspots: Hotspot[];
  stations: AirStation[];
  raw: RawLayers;
  fetchedAt: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Census tracts & analysis results                                    */
/* ------------------------------------------------------------------ */

export interface Tract {
  geoid: string;
  name: string;
  county: string;
  state: string;
  population: number;
  children: number;
  seniors: number;
  landAreaKm2: number;
  lon: number;
  lat: number;
}

export interface RiskFactors {
  nearestFireKm: number | null;
  nearestFireName: string | null;
  firesWithin100Km: number;
  hotspotsWithin50Km: number;
  smokeLevel: SmokeLevel;
  pm25: number | null;
  pm25Source: "monitor" | "forecast" | "none";
  childShare: number;
  seniorShare: number;
  densityPerKm2: number;
}

export interface RiskBreakdown {
  fire: number;
  air: number;
  vulnerability: number;
  total: number;
  category: RiskCategory;
  /** Air component on a 0–100 scale. */
  exposureIndex: number;
}

export interface TractAssessment {
  tract: Tract;
  factors: RiskFactors;
  risk: RiskBreakdown;
  region: Region | null;
}

export interface ExposureTotals {
  population: number;
  children: number;
  seniors: number;
  tracts: number;
  counties: number;
  /** Sorted by exposed population, descending. */
  states: string[];
}

export interface ExposureSummary {
  threshold: ExposureLevel;
  /** Totals for tracts at or above the threshold. */
  total: ExposureTotals;
  /** Per-level totals (exclusive bands) for levels 2–5. */
  byLevel: Record<ExposureLevel, ExposureTotals>;
  riskCounts: Record<RiskCategory, number>;
}

export interface CommunityRank {
  key: string;
  label: string;
  sublabel: string;
  geoid: string | null;
  lon: number;
  lat: number;
  population: number;
  children: number;
  seniors: number;
  maxLevel: SmokeLevel;
  pm25: number | null;
  risk: number;
  riskCategory: RiskCategory;
}

export type RankingKind = "exposure" | "seniors" | "children" | "air" | "risk";

export interface StationComparison {
  station: AirStation;
  expectedLevel: SmokeLevel;
  verdict: "above" | "within" | "below";
  region: Region | null;
}

export interface Finding {
  id: string;
  tone: "neutral" | "notice" | "alert";
  text: string;
}

export interface AnalysisResult {
  windowLabel: string;
  windowStart: number;
  windowEnd: number;
  assessments: TractAssessment[];
  summary: ExposureSummary;
  stationComparisons: StationComparison[];
  findings: Finding[];
  computedAt: number;
  durationMs: number;
  /** Tracts were capped at the query limit. */
  truncated: boolean;
}

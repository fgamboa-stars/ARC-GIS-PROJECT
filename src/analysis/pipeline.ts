import { regionForState } from "../config/regions";
import type { ExposureLevel } from "../config/smoke";
import type { AnalysisResult, Conditions, FireIncident, Hotspot, Tract, TractAssessment } from "../types/domain";
import { formatDateTime } from "../utils/format";
import { isExposed, summarizeExposure } from "./exposure";
import { generateFindings } from "./insights";
import { type RiskContext, buildRiskContext, computeFactors, scoreRisk } from "./riskScore";
import { SmokeFootprint, zonesInWindow } from "./smokeOverlay";
import { compareStations } from "./stationComparison";

export type WindowKind = "hour" | "24h" | "48h";

export interface AnalysisWindow {
  kind: WindowKind;
  /** Selected forecast hour (epoch ms). */
  start: number;
}

export interface AnalysisFilters {
  exposureThreshold: ExposureLevel;
  minFireAcres: number;
  includeContained: boolean;
  hotspotMaxAgeHours: number;
}

export const DEFAULT_FILTERS: AnalysisFilters = {
  exposureThreshold: 2,
  minFireAcres: 0,
  includeContained: false,
  hotspotMaxAgeHours: 24,
};

const HOUR = 3_600_000;
const WINDOW_SPAN: Record<WindowKind, number> = { hour: 0, "24h": 24 * HOUR, "48h": 48 * HOUR };
/** Observations are compared with the forecast only when within this many hours of it. */
const COMPARISON_TOLERANCE = 2 * HOUR;

export function resolveWindow(conditions: Conditions, window: AnalysisWindow) {
  if (conditions.mode === "replay") {
    return { start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY, label: "Snapshot" };
  }
  const end = window.start + WINDOW_SPAN[window.kind];
  const label =
    window.kind === "hour" ? formatDateTime(window.start) : `Next ${window.kind === "24h" ? "24" : "48"} hours (peak)`;
  return { start: window.start, end, label };
}

/** Applies the user's fire and hotspot filters; filtered features also drive the risk factors. */
export function filterIncidents(
  conditions: Conditions,
  filters: AnalysisFilters,
): { fires: FireIncident[]; hotspots: Hotspot[] } {
  return {
    fires: conditions.fires.filter(
      (f) =>
        (f.acres ?? 0) >= filters.minFireAcres &&
        (filters.includeContained || f.percentContained === null || f.percentContained < 100),
    ),
    hotspots: conditions.hotspots.filter((h) => h.hoursOld === null || h.hoursOld <= filters.hotspotMaxAgeHours),
  };
}

export function assessTract(tract: Tract, footprint: SmokeFootprint, ctx: RiskContext): TractAssessment {
  const factors = computeFactors(tract, footprint.levelAt(tract.lon, tract.lat), ctx);
  return { tract, factors, risk: scoreRisk(factors), region: regionForState(tract.state) };
}

export interface AnalysisRun {
  conditions: Conditions;
  result: AnalysisResult;
  footprint: SmokeFootprint;
  context: RiskContext;
}

export function runAnalysis(args: {
  conditions: Conditions;
  tracts: readonly Tract[];
  truncated: boolean;
  window: AnalysisWindow;
  filters: AnalysisFilters;
}): AnalysisRun {
  const t0 = performance.now();
  const { conditions, tracts, filters } = args;
  const win = resolveWindow(conditions, args.window);

  const footprint = new SmokeFootprint(zonesInWindow(conditions.smoke, win.start, win.end));
  const { fires, hotspots } = filterIncidents(conditions, filters);
  const context = buildRiskContext(fires, hotspots, conditions.stations);

  const assessments: TractAssessment[] = [];
  if (!footprint.isEmpty) {
    for (const tract of tracts) {
      const a = assessTract(tract, footprint, context);
      if (a.factors.smokeLevel >= 2) assessments.push(a);
    }
  }
  const summary = summarizeExposure(assessments, filters.exposureThreshold);
  const exposed = assessments.filter((a) => isExposed(a, filters.exposureThreshold));

  // Observations are compared with the smoke expected at the *selected hour*.
  const hourFootprint =
    args.window.kind === "hour" || conditions.mode === "replay"
      ? footprint
      : new SmokeFootprint(zonesInWindow(conditions.smoke, win.start, win.start));
  const comparable = conditions.stations.filter(
    (s) =>
      conditions.mode === "replay" ||
      (s.observedAt !== null && Math.abs(s.observedAt - args.window.start) <= COMPARISON_TOLERANCE),
  );
  const stationComparisons = compareStations(comparable, (lon, lat) => hourFootprint.levelAt(lon, lat));

  const findings = generateFindings({
    conditions: { ...conditions, fires, hotspots },
    summary,
    exposed,
    comparisons: stationComparisons,
    windowLabel: win.label,
    hotspotHours: filters.hotspotMaxAgeHours,
  });

  return {
    conditions,
    footprint,
    context,
    result: {
      windowLabel: win.label,
      windowStart: win.start,
      windowEnd: win.end,
      assessments,
      summary,
      stationComparisons,
      findings,
      computedAt: Date.now(),
      durationMs: Math.round(performance.now() - t0),
      truncated: args.truncated,
    },
  };
}

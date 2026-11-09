import { RISK_PARAMS } from "../config/risk";
import { regionForState } from "../config/regions";
import { type SmokeLevel, smokeInfo } from "../config/smoke";
import type { AirStation, StationComparison } from "../types/domain";

/**
 * Compares an observed PM2.5 value against the smoke band expected at the
 * monitor. Smoke bands describe smoke-only PM2.5, so a background allowance is
 * added to the upper bound before calling an observation "above".
 */
export function compareObservation(pm25: number, expected: SmokeLevel): StationComparison["verdict"] {
  const band = smokeInfo(expected);
  const upper = (expected >= 2 ? band.max : 3) + RISK_PARAMS.backgroundPm25;
  if (pm25 > upper) return "above";
  if (expected >= 3 && pm25 < band.min) return "below";
  return "within";
}

export function compareStations(
  stations: readonly AirStation[],
  levelAt: (lon: number, lat: number) => SmokeLevel,
): StationComparison[] {
  return stations.flatMap((station) => {
    if (station.pm25 === null) return [];
    const expectedLevel = levelAt(station.lon, station.lat);
    return [
      {
        station,
        expectedLevel,
        verdict: compareObservation(station.pm25, expectedLevel),
        region: regionForState(station.state),
      },
    ];
  });
}

export interface RegionDivergence {
  region: string;
  verdict: "above" | "below";
  count: number;
  total: number;
}

/** Regions where a meaningful share of monitors disagree with the smoke analysis. */
export function regionalDivergence(
  comparisons: readonly StationComparison[],
  minStations = 4,
  minShare = 0.35,
): RegionDivergence[] {
  const byRegion = new Map<string, StationComparison[]>();
  for (const c of comparisons) {
    if (!c.region) continue;
    const list = byRegion.get(c.region);
    if (list) list.push(c);
    else byRegion.set(c.region, [c]);
  }
  const out: RegionDivergence[] = [];
  for (const [region, list] of byRegion) {
    for (const verdict of ["above", "below"] as const) {
      const count = list.filter((c) => c.verdict === verdict).length;
      if (count >= minStations && count / list.length >= minShare) {
        out.push({ region, verdict, count, total: list.length });
      }
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

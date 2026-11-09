import { RISK_PARAMS as P, RISK_WEIGHTS as W, riskCategory } from "../config/risk";
import { type SmokeLevel, smokeInfo } from "../config/smoke";
import type { AirStation, FireIncident, Hotspot, RiskBreakdown, RiskFactors, Tract } from "../types/domain";
import { GridIndex, idw } from "./geo";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Spatial context shared by every tract in one analysis run. */
export interface RiskContext {
  fires: GridIndex<FireIncident>;
  hotspots: GridIndex<Hotspot>;
  stations: GridIndex<AirStation>;
}

export function buildRiskContext(fires: FireIncident[], hotspots: Hotspot[], stations: AirStation[]): RiskContext {
  return {
    fires: new GridIndex(fires, 1),
    hotspots: new GridIndex(hotspots, 0.5),
    stations: new GridIndex(
      stations.filter((s) => s.pm25 !== null),
      0.5,
    ),
  };
}

/** Collects the raw inputs to the score for one tract. */
export function computeFactors(tract: Tract, smokeLevel: SmokeLevel, ctx: RiskContext): RiskFactors {
  const nearest = ctx.fires.nearest(tract.lon, tract.lat, 1000);
  const monitored = idw(ctx.stations, tract.lon, tract.lat, P.pm25SearchRadiusKm, (s) => s.pm25);
  const forecastPm = smokeLevel >= 2 ? smokeInfo(smokeLevel).midpoint : null;
  const pop = Math.max(tract.population, 1);
  return {
    nearestFireKm: nearest ? nearest.distanceKm : null,
    nearestFireName: nearest ? nearest.item.name : null,
    firesWithin100Km: ctx.fires.countWithin(tract.lon, tract.lat, P.fireCountRadiusKm),
    hotspotsWithin50Km: ctx.hotspots.countWithin(tract.lon, tract.lat, P.hotspotRadiusKm),
    smokeLevel,
    pm25: monitored ?? forecastPm,
    pm25Source: monitored !== null ? "monitor" : forecastPm !== null ? "forecast" : "none",
    childShare: tract.children / pop,
    seniorShare: tract.seniors / pop,
    densityPerKm2: tract.population / tract.landAreaKm2,
  };
}

/**
 * Smoke Risk Score (0–100) = Fire (0–30) + Air (0–40) + Vulnerability (0–30).
 * Each factor is normalized to 0–1 against a saturation value, then weighted.
 */
export function scoreRisk(f: RiskFactors): RiskBreakdown {
  const proximity = f.nearestFireKm === null ? 0 : clamp01(1 - f.nearestFireKm / P.proximityMaxKm);
  const fire =
    W.fire.proximity * proximity +
    W.fire.count * clamp01(f.firesWithin100Km / P.fireCountSaturation) +
    W.fire.hotspots * clamp01(f.hotspotsWithin50Km / P.hotspotSaturation);

  const air =
    W.air.smoke * clamp01((f.smokeLevel - 1) / 4) + W.air.pm25 * clamp01((f.pm25 ?? 0) / P.pm25SaturationUgm3);

  const vulnerability =
    W.vulnerability.children * clamp01(f.childShare / P.childShareSaturation) +
    W.vulnerability.seniors * clamp01(f.seniorShare / P.seniorShareSaturation) +
    W.vulnerability.density * clamp01(Math.log10(1 + f.densityPerKm2) / Math.log10(1 + P.densitySaturation));

  const total = round1(fire + air + vulnerability);
  return {
    fire: round1(fire),
    air: round1(air),
    vulnerability: round1(vulnerability),
    total,
    category: riskCategory(total),
    exposureIndex: Math.round((air / (W.air.smoke + W.air.pm25)) * 100),
  };
}

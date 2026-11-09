/** Smoke Risk Score parameters. See docs/analysis-methodology.md. */

export const RISK_WEIGHTS = {
  fire: { proximity: 15, count: 7.5, hotspots: 7.5 },
  air: { smoke: 20, pm25: 20 },
  vulnerability: { children: 10, seniors: 10, density: 10 },
} as const;

export const RISK_PARAMS = {
  /** Fire proximity decays linearly to zero at this distance. */
  proximityMaxKm: 150,
  /** Radius for counting nearby active incidents. */
  fireCountRadiusKm: 100,
  /** Incident count that saturates the nearby-fire factor. */
  fireCountSaturation: 5,
  /** Radius for satellite hotspot density. */
  hotspotRadiusKm: 50,
  /** Hotspot count within radius that saturates the density factor. */
  hotspotSaturation: 25,
  /** PM2.5 that saturates the PM factor (top of EPA "Unhealthy", 2024 breakpoints). */
  pm25SaturationUgm3: 125.4,
  /** Maximum distance for an air monitor to inform a tract estimate. */
  pm25SearchRadiusKm: 50,
  /** Share of residents under 18 / 65+ that saturates each vulnerability factor. */
  childShareSaturation: 0.3,
  seniorShareSaturation: 0.3,
  /** Population density (persons/km²) that saturates the density factor (log scale). */
  densitySaturation: 10000,
  /**
   * Allowance for non-smoke background PM2.5 when comparing observations with
   * smoke-only forecast bands (µg/m³).
   */
  backgroundPm25: 9,
} as const;

export type RiskCategory = "Low" | "Moderate" | "High" | "Extreme";

export const RISK_CATEGORIES: readonly { category: RiskCategory; min: number }[] = [
  { category: "Extreme", min: 65 },
  { category: "High", min: 45 },
  { category: "Moderate", min: 25 },
  { category: "Low", min: 0 },
];

export const RISK_ORDER: readonly RiskCategory[] = ["Low", "Moderate", "High", "Extreme"];

export function riskCategory(score: number): RiskCategory {
  return RISK_CATEGORIES.find((c) => score >= c.min)?.category ?? "Low";
}

/** Single-hue ordinal ramp (light → dark). Lightest step still clears 2:1 on light surfaces. */
export const RISK_COLORS: Record<RiskCategory, string> = {
  Low: "#e9a07a",
  Moderate: "#d4683f",
  High: "#a8401f",
  Extreme: "#6b1a0b",
};

/** EPA AQI categories for PM2.5 (2024 breakpoints) with official colors. */
export const AQI_CATEGORIES = [
  { label: "Good", maxAqi: 50, maxPm25: 9.0, color: "#00e400" },
  { label: "Moderate", maxAqi: 100, maxPm25: 35.4, color: "#ffff00" },
  { label: "Unhealthy for Sensitive Groups", maxAqi: 150, maxPm25: 55.4, color: "#ff7e00" },
  { label: "Unhealthy", maxAqi: 200, maxPm25: 125.4, color: "#ff0000" },
  { label: "Very Unhealthy", maxAqi: 300, maxPm25: 225.4, color: "#8f3f97" },
  { label: "Hazardous", maxAqi: Number.POSITIVE_INFINITY, maxPm25: Number.POSITIVE_INFINITY, color: "#7e0023" },
] as const;

export function aqiCategoryForPm25(pm25: number): (typeof AQI_CATEGORIES)[number] {
  return AQI_CATEGORIES.find((c) => pm25 <= c.maxPm25) ?? AQI_CATEGORIES[AQI_CATEGORIES.length - 1]!;
}

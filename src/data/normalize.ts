import { PROVINCES } from "../config/regions";
import { levelFromClassDesc } from "../config/smoke";
import type {
  AirStation,
  Attributes,
  Conditions,
  EsriPointJSON,
  FireIncident,
  Hotspot,
  Mode,
  RawFeature,
  RawLayers,
  SmokeZone,
  Tract,
} from "../types/domain";

/**
 * Converts raw Living Atlas features (live or snapshot) into domain objects.
 * This is the only place that knows service field names.
 */

const HECTARES_TO_ACRES = 2.47105;

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function point(f: RawFeature<EsriPointJSON>, lonField?: string, latField?: string): [number, number] | null {
  const lon = num(f.geometry?.x) ?? (lonField ? num(f.attributes[lonField]) : null);
  const lat = num(f.geometry?.y) ?? (latField ? num(f.attributes[latField]) : null);
  return lon === null || lat === null ? null : [lon, lat];
}

export function normalizeSmoke(features: RawLayers["smoke"]): SmokeZone[] {
  const out: SmokeZone[] = [];
  features.forEach((f, i) => {
    const level = levelFromClassDesc(f.attributes.smoke_classdesc);
    const validTime = num(f.attributes.todate);
    if (level < 2 || validTime === null || !f.geometry?.rings.length) return;
    out.push({ id: num(f.attributes.OBJECTID) ?? i, level, validTime, geometry: f.geometry });
  });
  return out;
}

export function normalizeUsFire(f: RawFeature<EsriPointJSON>, i: number): FireIncident | null {
  const p = point(f);
  if (!p) return null;
  const a = f.attributes;
  return {
    id: str(a.UniqueFireIdentifier) ?? `us-${String(a.OBJECTID ?? i)}`,
    name: str(a.IncidentName) ?? "Unnamed incident",
    country: "US",
    jurisdiction: str(a.POOState)?.replace(/^US-/, "") ?? null,
    acres: num(a.DailyAcres) ?? num(a.CalculatedAcres),
    percentContained: num(a.PercentContained),
    status: null,
    discovered: num(a.FireDiscoveryDateTime),
    lon: p[0],
    lat: p[1],
  };
}

export function normalizeCaFire(f: RawFeature<EsriPointJSON>, i: number): FireIncident | null {
  const p = point(f);
  if (!p) return null;
  const a = f.attributes;
  const agency = str(a.agency_code);
  const pct = num(a.percent_contained);
  const ha = num(a.fire_size);
  return {
    id: str(a.national_fire_id) ?? `ca-${String(a.OBJECTID ?? i)}`,
    name: [agency, str(a.agency_fire_id)].filter(Boolean).join(" ") || "Unnamed fire",
    country: "CA",
    jurisdiction: agency ? (PROVINCES[agency] ?? agency) : null,
    acres: ha !== null && ha >= 0 ? ha * HECTARES_TO_ACRES : null,
    percentContained: pct !== null && pct >= 0 ? pct : null,
    status: str(a.stage_of_control_status),
    discovered: num(a.situation_report_date),
    lon: p[0],
    lat: p[1],
  };
}

export function normalizeHotspot(f: RawFeature<EsriPointJSON>): Hotspot | null {
  const p = point(f, "longitude", "latitude");
  if (!p) return null;
  return { lon: p[0], lat: p[1], frp: num(f.attributes.frp), hoursOld: num(f.attributes.hours_old) };
}

export function normalizeStation(f: RawFeature<EsriPointJSON>, i: number): AirStation | null {
  const p = point(f, "Longitude", "Latitude");
  if (!p) return null;
  const a = f.attributes;
  const pm25 = num(a.PM25);
  const aqi = num(a.PM25_AQI);
  return {
    id: str(a.AQSID) ?? String(a.ObjectId ?? i),
    name: str(a.SiteName) ?? "Monitor",
    state: str(a.StateName),
    pm25: pm25 !== null && pm25 >= 0 ? pm25 : null,
    aqi: aqi !== null && aqi >= 0 ? aqi : null,
    observedAt: num(a.ValidTime),
    lon: p[0],
    lat: p[1],
  };
}

function compact<T>(list: (T | null)[]): T[] {
  return list.filter((x): x is T => x !== null);
}

export function buildConditions(
  raw: RawLayers,
  meta: { mode: Mode; smokeKind: "forecast" | "observed"; label: string; referenceTime: number; warnings?: string[] },
): Conditions {
  const smoke = normalizeSmoke(raw.smoke);
  return {
    ...meta,
    warnings: meta.warnings ?? [],
    smokeTimes: [...new Set(smoke.map((z) => z.validTime))].sort((a, b) => a - b),
    smoke,
    fires: [...compact(raw.usFires.map(normalizeUsFire)), ...compact(raw.caFires.map(normalizeCaFire))],
    hotspots: compact(raw.hotspots.map(normalizeHotspot)),
    stations: compact(raw.stations.map(normalizeStation)),
    raw,
    fetchedAt: Date.now(),
  };
}

/** Tract attributes → Tract. Returns null for unpopulated tracts. */
export function normalizeTract(a: Attributes, centroid: { x: number; y: number } | null | undefined): Tract | null {
  const population = num(a.B01001_001E) ?? 0;
  if (population <= 0 || !centroid) return null;
  return {
    geoid: String(a.GEOID ?? ""),
    name: str(a.NAME) ?? "Census tract",
    county: str(a.County) ?? "",
    state: str(a.State) ?? "",
    population,
    children: num(a.B01001_calc_numLT18E) ?? 0,
    seniors: num(a.B01001_calc_numGE65E) ?? 0,
    landAreaKm2: Math.max((num(a.ALAND) ?? 0) / 1e6, 0.01),
    lon: centroid.x,
    lat: centroid.y,
  };
}

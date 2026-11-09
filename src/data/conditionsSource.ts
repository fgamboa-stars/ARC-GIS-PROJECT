import { NORTH_AMERICA_BBOX, SERVICES } from "../config/services";
import type { Conditions, EsriPointJSON, EsriPolygonJSON, RawFeature, RawLayers } from "../types/domain";
import {
  type ConditionsSnapshot,
  type SnapshotIndexEntry,
  SNAPSHOT_SCHEMA_VERSION,
  isSnapshotIndex,
  parseSnapshot,
} from "../types/snapshot";
import { type QueryFeature, queryAll } from "./arcgisRest";
import { buildConditions } from "./normalize";

const [XMIN, YMIN, XMAX, YMAX] = NORTH_AMERICA_BBOX;
const BBOX_WHERE = (lon: string, lat: string) =>
  `${lon} > ${XMIN} AND ${lon} < ${XMAX} AND ${lat} > ${YMIN} AND ${lat} < ${YMAX}`;

/** Hotspots older than this are not fetched (the UI filters within it). */
export const MAX_HOTSPOT_AGE_HOURS = 168;

function asPoints(features: QueryFeature[], lon?: string, lat?: string): RawFeature<EsriPointJSON>[] {
  return features.flatMap((f) => {
    const g = f.geometry as Partial<EsriPointJSON> | null | undefined;
    const x = typeof g?.x === "number" ? g.x : lon ? Number(f.attributes[lon]) : NaN;
    const y = typeof g?.y === "number" ? g.y : lat ? Number(f.attributes[lat]) : NaN;
    return Number.isFinite(x) && Number.isFinite(y) ? [{ attributes: f.attributes, geometry: { x, y } }] : [];
  });
}

function asPolygons(features: QueryFeature[]): RawFeature<EsriPolygonJSON>[] {
  return features.flatMap((f) => {
    const rings = (f.geometry as Partial<EsriPolygonJSON> | null | undefined)?.rings;
    return rings?.length ? [{ attributes: f.attributes, geometry: { rings } }] : [];
  });
}

/** Fetches current conditions from Living Atlas. Individual layer failures degrade gracefully. */
export async function fetchLiveConditions(signal?: AbortSignal): Promise<Conditions> {
  const tasks = {
    smoke: queryAll(SERVICES.smoke.url, {
      where: SERVICES.smoke.where,
      outFields: ["OBJECTID", "smoke_classdesc", "todate"],
      maxAllowableOffset: 0.01,
      geometryPrecision: 3,
      signal,
    }).then((r) => asPolygons(r.features)),
    usFires: queryAll(SERVICES.usFires.url, {
      where: SERVICES.usFires.where,
      outFields: [
        "OBJECTID",
        "IncidentName",
        "UniqueFireIdentifier",
        "DailyAcres",
        "CalculatedAcres",
        "PercentContained",
        "POOState",
        "FireDiscoveryDateTime",
        "IncidentTypeCategory",
      ],
      signal,
    }).then((r) => asPoints(r.features)),
    caFires: queryAll(SERVICES.caFires.url, {
      where: SERVICES.caFires.where,
      outFields: [
        "OBJECTID",
        "national_fire_id",
        "agency_code",
        "agency_fire_id",
        "fire_size",
        "percent_contained",
        "stage_of_control_status",
        "situation_report_date",
      ],
      signal,
    }).then((r) => asPoints(r.features)),
    hotspots: queryAll(SERVICES.hotspots.url, {
      where: `${BBOX_WHERE("longitude", "latitude")} AND hours_old <= ${MAX_HOTSPOT_AGE_HOURS}`,
      outFields: ["OBJECTID", "latitude", "longitude", "frp", "hours_old", "acq_time"],
      returnGeometry: false,
      pageSize: 32000,
      signal,
    }).then((r) => asPoints(r.features, "longitude", "latitude")),
    stations: queryAll(SERVICES.stations.url, {
      where: `${SERVICES.stations.where} AND ${BBOX_WHERE("Longitude", "Latitude")}`,
      outFields: [
        "ObjectId",
        "AQSID",
        "SiteName",
        "StateName",
        "PM25",
        "PM25_AQI",
        "ValidTime",
        "Latitude",
        "Longitude",
      ],
      returnGeometry: false,
      pageSize: 16000,
      signal,
    }).then((r) => asPoints(r.features, "Longitude", "Latitude")),
  };

  const keys = Object.keys(tasks) as (keyof typeof tasks)[];
  const settled = await Promise.allSettled(keys.map((k) => tasks[k]));
  signal?.throwIfAborted();

  const raw: RawLayers = { smoke: [], usFires: [], caFires: [], perimeters: [], hotspots: [], stations: [] };
  const warnings: string[] = [];
  settled.forEach((res, i) => {
    const key = keys[i]!;
    if (res.status === "fulfilled") {
      (raw[key] as RawFeature[]) = res.value;
    } else {
      warnings.push(
        `${SERVICES[key].title} is unavailable: ${res.reason instanceof Error ? res.reason.message : "unknown error"}`,
      );
    }
  });
  if (warnings.length === keys.length) throw new Error("Living Atlas services could not be reached.");

  return buildConditions(raw, {
    mode: "live",
    smokeKind: "forecast",
    label: "Live conditions",
    referenceTime: Date.now(),
    warnings,
  });
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

const REPLAY_BASE = `${import.meta.env.BASE_URL}replay/`;

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`);
  return res.json();
}

export async function fetchReplayIndex(signal?: AbortSignal): Promise<SnapshotIndexEntry[]> {
  const data = await getJson(`${REPLAY_BASE}index.json`, signal);
  if (!isSnapshotIndex(data)) throw new Error("Replay index is malformed.");
  return data;
}

export async function fetchSnapshot(entry: SnapshotIndexEntry, signal?: AbortSignal): Promise<ConditionsSnapshot> {
  return parseSnapshot(await getJson(`${REPLAY_BASE}${entry.file}`, signal));
}

export async function readSnapshotFile(file: File): Promise<ConditionsSnapshot> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  return parseSnapshot(data);
}

export function snapshotToConditions(snap: ConditionsSnapshot): Conditions {
  return buildConditions(snap.layers, {
    mode: "replay",
    smokeKind: snap.smokeKind,
    label: `${snap.title} — ${snap.subtitle}`,
    referenceTime: snap.validTime,
  });
}

/** Captures the selected forecast hour of live conditions as a replayable snapshot. */
export async function captureSnapshot(conditions: Conditions, smokeTime: number): Promise<ConditionsSnapshot> {
  const perimeters = await Promise.allSettled(
    [SERVICES.usPerimeters.url, SERVICES.caPerimeters.url].map((url) =>
      queryAll(url, { outFields: ["OBJECTID", "IncidentName"], maxAllowableOffset: 0.005, geometryPrecision: 4 }),
    ),
  );
  const date = new Date(smokeTime);
  const iso = date.toISOString().slice(0, 13).replace("T", "-");
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    id: `live-${iso}`,
    title: "Saved live conditions",
    subtitle: date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    description: "Snapshot captured from live Living Atlas layers.",
    validTime: smokeTime,
    createdAt: Date.now(),
    smokeKind: "forecast",
    sources: Object.values(SERVICES).map((s) => s.title),
    layers: {
      ...conditions.raw,
      smoke: conditions.raw.smoke.filter((f) => f.attributes.todate === smokeTime),
      perimeters: perimeters.flatMap((p) => (p.status === "fulfilled" ? asPolygons(p.value.features) : [])),
    },
  };
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

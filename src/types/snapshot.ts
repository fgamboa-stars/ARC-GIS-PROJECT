import type { RawLayerKey, RawLayers } from "./domain";

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** A saved set of conditions, replayable through the same analysis pipeline as live data. */
export interface ConditionsSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  id: string;
  title: string;
  subtitle: string;
  description: string;
  validTime: number;
  createdAt: number;
  smokeKind: "forecast" | "observed";
  view?: { center: [number, number]; zoom: number };
  sources: string[];
  layers: RawLayers;
}

export interface SnapshotIndexEntry {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  file: string;
}

const LAYER_KEYS: readonly RawLayerKey[] = ["smoke", "usFires", "caFires", "perimeters", "hotspots", "stations"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural validation for snapshot files (bundled or user-supplied). */
export function parseSnapshot(input: unknown): ConditionsSnapshot {
  if (!isRecord(input)) throw new Error("Snapshot is not a JSON object.");
  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported snapshot schema version: ${String(input.schemaVersion)}.`);
  }
  for (const key of ["id", "title"] as const) {
    if (typeof input[key] !== "string") throw new Error(`Snapshot is missing "${key}".`);
  }
  if (typeof input.validTime !== "number") throw new Error('Snapshot is missing "validTime".');
  const layers = input.layers;
  if (!isRecord(layers)) throw new Error('Snapshot is missing "layers".');
  for (const key of LAYER_KEYS) {
    const list = layers[key];
    if (list === undefined) {
      layers[key] = [];
      continue;
    }
    if (!Array.isArray(list)) throw new Error(`Snapshot layer "${key}" must be an array.`);
    for (const f of list) {
      if (!isRecord(f) || !isRecord(f.attributes)) {
        throw new Error(`Snapshot layer "${key}" contains an invalid feature.`);
      }
    }
  }
  const snap = input as unknown as Partial<ConditionsSnapshot> &
    Pick<ConditionsSnapshot, "id" | "title" | "validTime" | "layers">;
  return {
    ...snap,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    subtitle: snap.subtitle ?? "",
    description: snap.description ?? "",
    createdAt: snap.createdAt ?? Date.now(),
    smokeKind: snap.smokeKind === "forecast" ? "forecast" : "observed",
    sources: snap.sources ?? [],
  };
}

export function isSnapshotIndex(v: unknown): v is SnapshotIndexEntry[] {
  return Array.isArray(v) && v.every((e) => isRecord(e) && typeof e.id === "string" && typeof e.file === "string");
}

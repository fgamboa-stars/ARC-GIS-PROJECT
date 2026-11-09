/** Smoke severity scale shared by the NWS forecast and HMS (replay) data. */

export type SmokeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SmokeLevelInfo {
  level: SmokeLevel;
  label: string;
  /** NWS NDGD class string, `smoke_classdesc`. */
  classDesc: string | null;
  /** Near-surface smoke PM2.5 band in µg/m³. */
  min: number;
  max: number;
  /** Representative concentration used when no monitor is nearby. */
  midpoint: number;
}

export const SMOKE_LEVELS: readonly SmokeLevelInfo[] = [
  { level: 0, label: "None", classDesc: null, min: 0, max: 0, midpoint: 0 },
  { level: 1, label: "Trace", classDesc: "0 - 3", min: 0, max: 3, midpoint: 1.5 },
  { level: 2, label: "Light", classDesc: "3 - 25", min: 3, max: 25, midpoint: 14 },
  { level: 3, label: "Moderate", classDesc: "25 - 63", min: 25, max: 63, midpoint: 44 },
  { level: 4, label: "Heavy", classDesc: "63 - 158", min: 63, max: 158, midpoint: 110 },
  { level: 5, label: "Very heavy", classDesc: "158 - 1000", min: 158, max: 1000, midpoint: 200 },
];

/** Levels that count as "exposure" (Trace is excluded by design). */
export const EXPOSURE_LEVELS = [2, 3, 4, 5] as const satisfies readonly SmokeLevel[];
export type ExposureLevel = (typeof EXPOSURE_LEVELS)[number];

export function smokeInfo(level: SmokeLevel): SmokeLevelInfo {
  return SMOKE_LEVELS[level] ?? SMOKE_LEVELS[0]!;
}

export function levelFromClassDesc(desc: unknown): SmokeLevel {
  if (typeof desc !== "string") return 0;
  const norm = desc.replace(/\s+/g, "");
  const match = SMOKE_LEVELS.find((s) => s.classDesc?.replace(/\s+/g, "") === norm);
  return match?.level ?? 0;
}

export function formatSmokeBand(level: SmokeLevel): string {
  const s = smokeInfo(level);
  if (level === 0) return "No smoke";
  if (level === 5) return `${s.label} (>${s.min} µg/m³)`;
  return `${s.label} (${s.min}–${s.max} µg/m³)`;
}

/**
 * Map fills by theme. Smoke is drawn as neutral haze (charcoal on light maps,
 * pale haze on dark maps) so that the monochrome palette carries severity by
 * lightness alone; alpha increases with level.
 */
export const SMOKE_FILL: Record<"light" | "dark", Record<SmokeLevel, [number, number, number, number]>> = {
  light: {
    0: [0, 0, 0, 0],
    1: [90, 90, 90, 0.1],
    2: [80, 72, 64, 0.3],
    3: [64, 54, 46, 0.45],
    4: [44, 34, 28, 0.6],
    5: [20, 12, 8, 0.74],
  },
  dark: {
    0: [0, 0, 0, 0],
    1: [220, 220, 220, 0.08],
    2: [214, 204, 190, 0.26],
    3: [226, 212, 192, 0.4],
    4: [238, 222, 198, 0.55],
    5: [250, 238, 220, 0.7],
  },
};

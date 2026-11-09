import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { snapshotToConditions } from "../data/conditionsSource";
import { parseSnapshot } from "../types/snapshot";
import type { Tract } from "../types/domain";
import { DEFAULT_FILTERS, runAnalysis } from "./pipeline";
import { queryFootprint } from "./smokeOverlay";

const snap = parseSnapshot(JSON.parse(readFileSync("public/replay/2023-06-07-northeast.json", "utf8")));
const conditions = snapshotToConditions(snap);

const t = (geoid: string, name: string, state: string, lon: number, lat: number): Tract => ({
  geoid,
  name,
  county: name,
  state,
  population: 5000,
  children: 1000,
  seniors: 800,
  landAreaKm2: 2,
  lon,
  lat,
});

describe("replay pipeline (ArcGIS geometry operators)", () => {
  it("classifies tracts inside and outside the observed smoke", () => {
    const tracts = [
      t("36061000100", "Manhattan", "New York", -73.97, 40.78),
      t("42101000100", "Philadelphia", "Pennsylvania", -75.16, 39.95),
      t("06037000100", "Los Angeles", "California", -118.24, 34.05),
    ];
    const { result } = runAnalysis({
      conditions,
      tracts,
      truncated: false,
      window: { kind: "hour", start: snap.validTime },
      filters: DEFAULT_FILTERS,
    });
    const byId = new Map(result.assessments.map((a) => [a.tract.geoid, a]));
    expect(byId.get("36061000100")?.factors.smokeLevel).toBeGreaterThanOrEqual(3);
    expect(byId.has("06037000100")).toBe(false);
    expect(result.summary.total.population).toBeGreaterThanOrEqual(5000);
    expect(result.stationComparisons.length).toBeGreaterThan(100);
    expect(result.findings.length).toBeGreaterThan(2);
    const nyc = byId.get("36061000100");
    expect(nyc?.factors.pm25Source).toBe("monitor");
    expect(nyc?.factors.pm25 ?? 0).toBeGreaterThan(55);
  });

  it("builds a compact query footprint", () => {
    const fp = queryFootprint(conditions.smoke);
    expect(fp?.rings.length).toBeGreaterThan(0);
    expect(JSON.stringify(fp).length).toBeLessThan(400_000);
  });
});

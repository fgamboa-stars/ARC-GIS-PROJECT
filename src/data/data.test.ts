import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { levelFromClassDesc } from "../config/smoke";
import { lookupState } from "../config/regions";
import { parseSnapshot } from "../types/snapshot";
import { formatApprox, formatCompact, listNames } from "../utils/format";
import { buildConditions, normalizeCaFire, normalizeStation } from "./normalize";

describe("normalization", () => {
  it("maps smoke class strings to levels", () => {
    expect(levelFromClassDesc("0 - 3")).toBe(1);
    expect(levelFromClassDesc("25 - 63")).toBe(3);
    expect(levelFromClassDesc("158 - 1000")).toBe(5);
    expect(levelFromClassDesc(null)).toBe(0);
  });

  it("converts Canadian fire sizes from hectares and ignores unknown containment", () => {
    const f = normalizeCaFire(
      {
        attributes: { agency_code: "BC", agency_fire_id: "G92299", fire_size: 100, percent_contained: -1 },
        geometry: { x: -120, y: 55 },
      },
      0,
    );
    expect(f?.name).toBe("BC G92299");
    expect(f?.jurisdiction).toBe("British Columbia");
    expect(f?.acres).toBeCloseTo(247.1, 0);
    expect(f?.percentContained).toBeNull();
  });

  it("reads station coordinates from attributes when geometry is absent", () => {
    const s = normalizeStation(
      { attributes: { SiteName: "A", PM25: -999, Latitude: 40, Longitude: -100 }, geometry: { x: NaN, y: NaN } },
      0,
    );
    expect(s?.lat).toBe(40);
    expect(s?.pm25).toBeNull();
  });

  it("resolves state names and codes", () => {
    expect(lookupState("US-OR")?.region).toBe("Pacific Northwest");
    expect(lookupState("Minnesota")?.abbr).toBe("MN");
    expect(lookupState("XX")).toBeNull();
  });
});

describe("replay snapshots", () => {
  const index = JSON.parse(readFileSync("public/replay/index.json", "utf8")) as { file: string }[];

  it.each(index.map((e) => e.file))("%s parses and normalizes", (file) => {
    const snap = parseSnapshot(JSON.parse(readFileSync(`public/replay/${file}`, "utf8")));
    const c = buildConditions(snap.layers, {
      mode: "replay",
      smokeKind: snap.smokeKind,
      label: snap.title,
      referenceTime: snap.validTime,
    });
    expect(c.smoke.length).toBeGreaterThan(10);
    expect(c.stations.length).toBeGreaterThan(500);
    expect(c.fires.length).toBeGreaterThan(0);
    expect(c.smokeTimes).toHaveLength(1);
  });

  it("rejects malformed snapshots", () => {
    expect(() => parseSnapshot({ schemaVersion: 99 })).toThrow(/schema version/);
    expect(() =>
      parseSnapshot({ schemaVersion: 1, id: "x", title: "t", validTime: 1, layers: { smoke: {} } }),
    ).toThrow();
  });
});

describe("formatting", () => {
  it("rounds for prose", () => {
    expect(formatApprox(3_214_880)).toBe("3.2 million");
    expect(formatApprox(541_203)).toBe("540,000");
    expect(formatApprox(12_345_678)).toBe("12 million");
    expect(formatCompact(3_214_880)).toBe("3.2M");
  });

  it("joins names", () => {
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 others");
  });
});

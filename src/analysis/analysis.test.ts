import { describe, expect, it } from "vitest";
import { riskCategory } from "../config/risk";
import type { AirStation, FireIncident, RiskFactors, Tract, TractAssessment } from "../types/domain";
import { summarizeExposure } from "./exposure";
import { GridIndex, haversineKm, idw } from "./geo";
import { generateFindings } from "./insights";
import { aggregateCounties, rankCommunities } from "./rankings";
import { buildRiskContext, computeFactors, scoreRisk } from "./riskScore";
import { compareObservation, regionalDivergence } from "./stationComparison";

const tract = (over: Partial<Tract> = {}): Tract => ({
  geoid: "36061000100",
  name: "Census Tract 1",
  county: "New York County",
  state: "New York",
  population: 4000,
  children: 800,
  seniors: 600,
  landAreaKm2: 0.5,
  lon: -73.98,
  lat: 40.75,
  ...over,
});

const baseFactors: RiskFactors = {
  nearestFireKm: null,
  nearestFireName: null,
  firesWithin100Km: 0,
  hotspotsWithin50Km: 0,
  smokeLevel: 0,
  pm25: null,
  pm25Source: "none",
  childShare: 0,
  seniorShare: 0,
  densityPerKm2: 0,
};

const assess = (t: Tract, level: 0 | 1 | 2 | 3 | 4 | 5, pm25: number | null = null): TractAssessment => {
  const factors: RiskFactors = {
    ...baseFactors,
    smokeLevel: level,
    pm25,
    pm25Source: pm25 === null ? "none" : "monitor",
    childShare: t.children / t.population,
    seniorShare: t.seniors / t.population,
    densityPerKm2: t.population / t.landAreaKm2,
  };
  return { tract: t, factors, risk: scoreRisk(factors), region: null };
};

describe("geo", () => {
  it("computes great-circle distance", () => {
    // New York → Philadelphia ≈ 130 km
    expect(haversineKm(-74.006, 40.7128, -75.1652, 39.9526)).toBeGreaterThan(125);
    expect(haversineKm(-74.006, 40.7128, -75.1652, 39.9526)).toBeLessThan(135);
  });

  it("finds items within a radius across cell boundaries", () => {
    const pts = [
      { lon: -100.01, lat: 40 },
      { lon: -99.99, lat: 40 },
      { lon: -98, lat: 40 },
    ];
    const index = new GridIndex(pts, 0.5);
    expect(index.countWithin(-100, 40, 5)).toBe(2);
    expect(index.nearest(-98.1, 40, 50)?.item).toBe(pts[2]);
    expect(index.nearest(-90, 40, 50)).toBeNull();
  });

  it("interpolates with inverse distance weighting", () => {
    const stations = [
      { lon: -100, lat: 40, v: 10 },
      { lon: -99.8, lat: 40, v: 30 },
    ];
    const index = new GridIndex(stations, 0.5);
    const mid = idw(index, -99.9, 40, 50, (s) => s.v);
    expect(mid).toBeCloseTo(20, 1);
    expect(idw(index, -100, 40, 50, (s) => s.v)).toBeCloseTo(10, 1);
    expect(idw(index, -80, 40, 50, (s) => s.v)).toBeNull();
  });
});

describe("risk score", () => {
  it("is zero with no smoke, fire or vulnerable residents", () => {
    const r = scoreRisk(baseFactors);
    expect(r.total).toBe(0);
    expect(r.category).toBe("Low");
  });

  it("saturates at 100", () => {
    const r = scoreRisk({
      ...baseFactors,
      nearestFireKm: 0,
      firesWithin100Km: 10,
      hotspotsWithin50Km: 100,
      smokeLevel: 5,
      pm25: 500,
      childShare: 0.5,
      seniorShare: 0.5,
      densityPerKm2: 50000,
    });
    expect(r.total).toBe(100);
    expect(r.category).toBe("Extreme");
    expect(r.exposureIndex).toBe(100);
  });

  it("weights components 30/40/30", () => {
    const fireOnly = scoreRisk({ ...baseFactors, nearestFireKm: 0, firesWithin100Km: 5, hotspotsWithin50Km: 25 });
    expect(fireOnly.fire).toBe(30);
    const airOnly = scoreRisk({ ...baseFactors, smokeLevel: 5, pm25: 125.4 });
    expect(airOnly.air).toBe(40);
  });

  it("maps scores to categories", () => {
    expect(riskCategory(10)).toBe("Low");
    expect(riskCategory(25)).toBe("Moderate");
    expect(riskCategory(50)).toBe("High");
    expect(riskCategory(80)).toBe("Extreme");
  });

  it("derives factors from nearby features and falls back to forecast PM2.5", () => {
    const fire: FireIncident = {
      id: "f1",
      name: "Test Fire",
      country: "US",
      jurisdiction: "NY",
      acres: 1000,
      percentContained: 10,
      status: null,
      discovered: null,
      lon: -73.9,
      lat: 40.8,
    };
    const ctx = buildRiskContext([fire], [{ lon: -73.95, lat: 40.76, frp: 3, hoursOld: 2 }], []);
    const f = computeFactors(tract(), 4, ctx);
    expect(f.nearestFireName).toBe("Test Fire");
    expect(f.nearestFireKm).toBeLessThan(10);
    expect(f.firesWithin100Km).toBe(1);
    expect(f.hotspotsWithin50Km).toBe(1);
    expect(f.pm25Source).toBe("forecast");
    expect(f.pm25).toBe(110);

    const station: AirStation = {
      id: "s",
      name: "S",
      state: "NY",
      pm25: 80,
      aqi: 160,
      observedAt: 0,
      lon: -73.98,
      lat: 40.75,
    };
    const withMonitor = computeFactors(tract(), 4, buildRiskContext([], [], [station]));
    expect(withMonitor.pm25Source).toBe("monitor");
    expect(withMonitor.pm25).toBe(80);
  });
});

describe("exposure summary", () => {
  const list = [
    assess(tract({ geoid: "1", population: 1000, children: 200, seniors: 100 }), 2),
    assess(tract({ geoid: "2", population: 3000, children: 600, seniors: 300, county: "Kings County" }), 4),
    assess(
      tract({ geoid: "3", population: 500, children: 50, seniors: 50, state: "New Jersey", county: "Bergen County" }),
      3,
    ),
  ];

  it("totals population at or above the threshold", () => {
    const s = summarizeExposure(list, 2);
    expect(s.total.population).toBe(4500);
    expect(s.total.children).toBe(850);
    expect(s.total.seniors).toBe(450);
    expect(s.total.tracts).toBe(3);
    expect(s.total.counties).toBe(3);
    expect(s.total.states).toEqual(["New York", "New Jersey"]);
  });

  it("respects higher thresholds and per-level bands", () => {
    const s = summarizeExposure(list, 3);
    expect(s.total.population).toBe(3500);
    expect(s.byLevel[2].population).toBe(1000);
    expect(s.byLevel[4].population).toBe(3000);
    expect(s.byLevel[5].population).toBe(0);
  });
});

describe("rankings", () => {
  const list = [
    assess(tract({ geoid: "1", population: 1000, seniors: 400 }), 2, 20),
    assess(tract({ geoid: "2", population: 3500, seniors: 100, county: "Kings County" }), 4, 90),
    assess(tract({ geoid: "3", population: 2000, seniors: 100 }), 3, 40),
  ];

  it("aggregates tracts to counties with population-weighted PM2.5", () => {
    const counties = aggregateCounties(list);
    const ny = counties.find((c) => c.label === "New York County");
    expect(ny?.population).toBe(3000);
    expect(ny?.pm25).toBeCloseTo((20 * 1000 + 40 * 2000) / 3000, 1);
    expect(ny?.maxLevel).toBe(3);
  });

  it("orders by the requested metric", () => {
    expect(rankCommunities(list, "seniors", "tract")[0]?.geoid).toBe("1");
    expect(rankCommunities(list, "air", "tract")[0]?.geoid).toBe("2");
    expect(rankCommunities(list, "exposure", "county")[0]?.label).toBe("Kings County");
    expect(rankCommunities(list, "exposure", "tract", 2)).toHaveLength(2);
  });
});

describe("observed vs expected air quality", () => {
  it("classifies observations against smoke bands with a background allowance", () => {
    expect(compareObservation(10, 0)).toBe("within");
    expect(compareObservation(20, 0)).toBe("above");
    expect(compareObservation(30, 2)).toBe("within");
    expect(compareObservation(40, 2)).toBe("above");
    expect(compareObservation(10, 3)).toBe("below");
  });

  it("flags regions where many monitors diverge", () => {
    const st = (pm25: number): AirStation => ({
      id: String(pm25),
      name: "x",
      state: "MN",
      pm25,
      aqi: null,
      observedAt: null,
      lon: 0,
      lat: 0,
    });
    const comps = [50, 60, 70, 80, 5].map((v) => ({
      station: st(v),
      expectedLevel: 0 as const,
      verdict: compareObservation(v, 0),
      region: "Upper Midwest" as const,
    }));
    expect(regionalDivergence(comps)).toEqual([{ region: "Upper Midwest", verdict: "above", count: 4, total: 5 }]);
  });
});

describe("findings", () => {
  const exposed = [
    assess(tract({ geoid: "1", population: 2_400_000, children: 480_000, seniors: 390_000 }), 4),
    assess(tract({ geoid: "2", population: 800_000, children: 240_000, seniors: 150_000, state: "New Jersey" }), 2),
  ];
  const summary = summarizeExposure(exposed, 2);
  const conditions = { mode: "live" as const, smokeKind: "forecast" as const, fires: [], hotspots: [], stations: [] };

  it("writes headline and vulnerability findings from the totals", () => {
    const f = generateFindings({ conditions, summary, exposed, comparisons: [], windowLabel: "Now", hotspotHours: 24 });
    const text = f.map((x) => x.text).join("\n");
    expect(text).toContain("approximately 3.2 million residents are forecast to experience");
    expect(text).toContain("About 540,000 adults aged 65+ and 720,000 children");
    expect(text).toContain("Heavy (63–158 µg/m³)");
  });

  it("reports the absence of smoke without inventing numbers", () => {
    const empty = summarizeExposure([], 2);
    const f = generateFindings({
      conditions,
      summary: empty,
      exposed: [],
      comparisons: [],
      windowLabel: "Now",
      hotspotHours: 24,
    });
    expect(f[0]?.id).toBe("no-exposure");
    expect(f.some((x) => /\d/.test(x.text) && x.id === "headline")).toBe(false);
  });
});

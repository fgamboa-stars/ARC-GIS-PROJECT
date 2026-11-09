import { riskCategory } from "../config/risk";
import type { SmokeLevel } from "../config/smoke";
import type { CommunityRank, RankingKind, TractAssessment } from "../types/domain";

export type RankingScope = "county" | "tract";

export const RANKING_KINDS: readonly { kind: RankingKind; label: string; metric: string }[] = [
  { kind: "exposure", label: "Highest exposure", metric: "Residents exposed" },
  { kind: "seniors", label: "Highest senior exposure", metric: "Adults 65+ exposed" },
  { kind: "children", label: "Highest child exposure", metric: "Children exposed" },
  { kind: "air", label: "Worst air quality", metric: "PM2.5 (µg/m³)" },
  { kind: "risk", label: "Highest risk scores", metric: "Smoke Risk Score" },
];

function tractRank(a: TractAssessment): CommunityRank {
  const t = a.tract;
  return {
    key: t.geoid,
    label: t.name,
    sublabel: `${t.county}, ${t.state}`,
    geoid: t.geoid,
    lon: t.lon,
    lat: t.lat,
    population: t.population,
    children: t.children,
    seniors: t.seniors,
    maxLevel: a.factors.smokeLevel,
    pm25: a.factors.pm25Source === "monitor" ? a.factors.pm25 : null,
    risk: a.risk.total,
    riskCategory: a.risk.category,
  };
}

/** Rolls tracts up to counties: sums for counts, population-weighted means for rates. */
export function aggregateCounties(assessments: readonly TractAssessment[]): CommunityRank[] {
  const groups = new Map<string, TractAssessment[]>();
  for (const a of assessments) {
    const key = `${a.tract.state}|${a.tract.county}`;
    const g = groups.get(key);
    if (g) g.push(a);
    else groups.set(key, [a]);
  }
  return [...groups.entries()].map(([key, list]) => {
    let population = 0;
    let children = 0;
    let seniors = 0;
    let riskSum = 0;
    let pmSum = 0;
    let pmPop = 0;
    let maxLevel: SmokeLevel = 0;
    let lonSum = 0;
    let latSum = 0;
    for (const a of list) {
      const p = a.tract.population;
      population += p;
      children += a.tract.children;
      seniors += a.tract.seniors;
      riskSum += a.risk.total * p;
      lonSum += a.tract.lon * p;
      latSum += a.tract.lat * p;
      if (a.factors.smokeLevel > maxLevel) maxLevel = a.factors.smokeLevel;
      if (a.factors.pm25Source === "monitor" && a.factors.pm25 !== null) {
        pmSum += a.factors.pm25 * p;
        pmPop += p;
      }
    }
    const first = list[0]!.tract;
    const risk = population > 0 ? Math.round((riskSum / population) * 10) / 10 : 0;
    return {
      key,
      label: first.county,
      sublabel: `${first.state} · ${list.length.toLocaleString()} tracts`,
      geoid: null,
      lon: population > 0 ? lonSum / population : first.lon,
      lat: population > 0 ? latSum / population : first.lat,
      population,
      children,
      seniors,
      maxLevel,
      pm25: pmPop > 0 ? Math.round((pmSum / pmPop) * 10) / 10 : null,
      risk,
      riskCategory: riskCategory(risk),
    };
  });
}

const METRIC: Record<RankingKind, (r: CommunityRank) => number | null> = {
  exposure: (r) => r.population,
  seniors: (r) => r.seniors,
  children: (r) => r.children,
  air: (r) => r.pm25,
  risk: (r) => r.risk,
};

export function rankingValue(kind: RankingKind, r: CommunityRank): number | null {
  return METRIC[kind](r);
}

export function rankCommunities(
  assessments: readonly TractAssessment[],
  kind: RankingKind,
  scope: RankingScope,
  limit = 10,
): CommunityRank[] {
  const rows = scope === "county" ? aggregateCounties(assessments) : assessments.map(tractRank);
  const metric = METRIC[kind];
  return rows
    .filter((r) => metric(r) !== null)
    .sort((a, b) => (metric(b) ?? 0) - (metric(a) ?? 0) || b.population - a.population)
    .slice(0, limit);
}

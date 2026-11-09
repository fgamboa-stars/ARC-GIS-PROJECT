import { RISK_ORDER, type RiskCategory } from "../config/risk";
import { EXPOSURE_LEVELS, type ExposureLevel } from "../config/smoke";
import type { ExposureSummary, ExposureTotals, TractAssessment } from "../types/domain";

function emptyTotals(): ExposureTotals {
  return { population: 0, children: 0, seniors: 0, tracts: 0, counties: 0, states: [] };
}

function totalsOf(list: readonly TractAssessment[]): ExposureTotals {
  const t = emptyTotals();
  const counties = new Set<string>();
  const statePop = new Map<string, number>();
  for (const { tract } of list) {
    t.population += tract.population;
    t.children += tract.children;
    t.seniors += tract.seniors;
    t.tracts += 1;
    counties.add(`${tract.state}|${tract.county}`);
    if (tract.state) statePop.set(tract.state, (statePop.get(tract.state) ?? 0) + tract.population);
  }
  t.counties = counties.size;
  // Most-affected states first, so findings lead with them.
  t.states = [...statePop.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return t;
}

export function isExposed(a: TractAssessment, threshold: ExposureLevel): boolean {
  return a.factors.smokeLevel >= threshold;
}

/** Aggregates tract assessments into exposure totals at and above `threshold`. */
export function summarizeExposure(assessments: readonly TractAssessment[], threshold: ExposureLevel): ExposureSummary {
  const exposed = assessments.filter((a) => isExposed(a, threshold));
  const byLevel = Object.fromEntries(
    EXPOSURE_LEVELS.map((lvl) => [lvl, totalsOf(assessments.filter((a) => a.factors.smokeLevel === lvl))]),
  ) as Record<ExposureLevel, ExposureTotals>;
  const riskCounts = Object.fromEntries(RISK_ORDER.map((c) => [c, 0])) as Record<RiskCategory, number>;
  for (const a of exposed) riskCounts[a.risk.category] += 1;
  return { threshold, total: totalsOf(exposed), byLevel, riskCounts };
}

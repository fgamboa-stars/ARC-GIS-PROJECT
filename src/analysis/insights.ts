import { regionForState } from "../config/regions";
import { formatSmokeBand, smokeInfo } from "../config/smoke";
import type { Conditions, ExposureSummary, Finding, StationComparison, TractAssessment } from "../types/domain";
import { formatApprox, formatInt, formatPm, listNames, plural } from "../utils/format";
import { aggregateCounties } from "./rankings";
import { regionalDivergence } from "./stationComparison";

export interface InsightInput {
  conditions: Pick<Conditions, "mode" | "smokeKind" | "fires" | "hotspots" | "stations">;
  summary: ExposureSummary;
  exposed: readonly TractAssessment[];
  comparisons: readonly StationComparison[];
  windowLabel: string;
  /** Age limit applied to satellite detections, in hours. */
  hotspotHours: number;
}

/** Turns analysis results into plain-language findings. Every number comes from the inputs. */
export function generateFindings(input: InsightInput): Finding[] {
  const { conditions, summary, exposed, comparisons, windowLabel, hotspotHours } = input;
  const findings: Finding[] = [];
  const total = summary.total;
  const forecast = conditions.smokeKind === "forecast";
  const when = conditions.mode === "live" ? windowLabel.toLowerCase() : "on this date";
  const smokeWord = forecast ? "forecast" : "observed";
  const bandLabel = smokeInfo(summary.threshold).label.toLowerCase();

  // 1. Headline exposure.
  if (total.population === 0) {
    findings.push({
      id: "no-exposure",
      tone: "neutral",
      text:
        conditions.mode === "live"
          ? `No populated census tracts are ${smokeWord} to experience ${bandLabel} or heavier wildfire smoke ${when}. Switch to Replay to explore a major smoke event.`
          : `No populated census tracts fall within ${bandLabel} or heavier smoke in this snapshot.`,
    });
  } else {
    const regions = new Set(total.states.map((s) => regionForState(s)).filter(Boolean));
    const where =
      total.states.length > 6
        ? `across ${plural(total.states.length, "state")} and ${plural(regions.size, "region")}`
        : `across ${listNames(total.states, 6)}`;
    findings.push({
      id: "headline",
      tone: "alert",
      text: `${conditions.mode === "live" ? "Today" : "On this date"}, approximately ${formatApprox(total.population)} residents ${forecast ? "are forecast to experience" : "lived beneath"} ${bandLabel} or heavier wildfire smoke ${where}.`,
    });
    findings.push({
      id: "vulnerable",
      tone: "notice",
      text: `About ${formatApprox(total.seniors)} adults aged 65+ and ${formatApprox(total.children)} children live within ${smokeWord} smoke zones.`,
    });
  }

  // 2. Heaviest smoke.
  const heavyLevels = ([5, 4, 3] as const).filter((l) => summary.byLevel[l].population > 0);
  const top = heavyLevels[0];
  if (top !== undefined) {
    const band = summary.byLevel[top];
    findings.push({
      id: "heaviest",
      tone: top >= 4 ? "alert" : "notice",
      text: `The heaviest ${smokeWord} smoke — ${formatSmokeBand(top)} — covers parts of ${listNames(band.states, 4)}, where ${formatApprox(band.population)} people live.`,
    });
  }

  // 3. Most-affected county.
  if (exposed.length > 0) {
    const counties = aggregateCounties(exposed).sort((a, b) => b.population - a.population);
    const lead = counties[0];
    if (lead) {
      findings.push({
        id: "top-county",
        tone: "neutral",
        text: `${lead.label}, ${lead.sublabel.split(" · ")[0] ?? ""} has the largest exposed population (${formatApprox(lead.population)} residents, including ${formatApprox(lead.seniors)} adults 65+).`,
      });
    }
    const highRisk = summary.riskCounts.High + summary.riskCounts.Extreme;
    if (highRisk > 0) {
      const people = exposed
        .filter((a) => a.risk.category === "High" || a.risk.category === "Extreme")
        .reduce((s, a) => s + a.tract.population, 0);
      findings.push({
        id: "risk",
        tone: summary.riskCounts.Extreme > 0 ? "alert" : "notice",
        text: `${plural(highRisk, "census tract")} (${formatApprox(people)} residents) score High or Extreme on the Smoke Risk Score${summary.riskCounts.Extreme > 0 ? `, including ${formatInt(summary.riskCounts.Extreme)} Extreme` : ""}.`,
      });
    }
  }

  // 4. Observed vs. expected air quality.
  const divergences = regionalDivergence(comparisons);
  const reference = forecast ? "forecast expectations" : "the satellite smoke analysis";
  const above = divergences.filter((d) => d.verdict === "above").map((d) => d.region);
  const below = divergences.filter((d) => d.verdict === "below").map((d) => d.region);
  if (above.length > 0) {
    findings.push({
      id: "obs-above",
      tone: "alert",
      text: `${conditions.mode === "live" ? "Current" : "Daily"} PM2.5 observations exceed ${reference} across portions of the ${listNames(above, 3)}.`,
    });
  }
  if (below.length > 0) {
    findings.push({
      id: "obs-below",
      tone: "neutral",
      text: `Monitors in the ${listNames(below, 3)} read lower than ${reference} — smoke may be aloft rather than at ground level.`,
    });
  }
  if (comparisons.length > 0 && above.length === 0 && below.length === 0) {
    const matching = comparisons.filter((c) => c.verdict === "within").length;
    findings.push({
      id: "obs-match",
      tone: "neutral",
      text: `Observed PM2.5 is broadly consistent with ${reference}: ${formatInt(matching)} of ${formatInt(comparisons.length)} monitors fall within the expected range.`,
    });
  }

  const worst = [...conditions.stations]
    .filter((s) => s.pm25 !== null)
    .sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0))[0];
  if (worst?.pm25 != null && worst.pm25 > 35.4) {
    findings.push({
      id: "worst-monitor",
      tone: worst.pm25 > 55.4 ? "alert" : "notice",
      text: `The highest PM2.5 reading is ${formatPm(worst.pm25)} at ${worst.name}${worst.state ? `, ${worst.state}` : ""}.`,
    });
  }

  // 5. Fire activity.
  const us = conditions.fires.filter((f) => f.country === "US").length;
  const ca = conditions.fires.filter((f) => f.country === "CA").length;
  if (us + ca > 0 || conditions.hotspots.length > 0) {
    findings.push({
      id: "fires",
      tone: "neutral",
      text: `${plural(us, "active U.S. wildfire")} and ${plural(ca, "Canadian fire")} are being tracked, with ${formatInt(conditions.hotspots.length)} satellite heat detections ${conditions.mode === "live" ? `in the past ${formatInt(hotspotHours)} hours` : "that day"}.`,
    });
  }

  return findings;
}

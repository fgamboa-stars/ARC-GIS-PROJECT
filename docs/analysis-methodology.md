# Analysis Methodology

This document describes how the dashboard turns smoke, fire, air-quality and census layers into exposure counts, risk scores and findings. All parameters are defined in `src/config/risk.ts` and `src/config/smoke.ts`.

## 1. Smoke severity scale

| Level | Label | Smoke PM2.5 band (µg/m³) | NWS class | HMS density (replay) | Counted as exposure |
| --- | --- | --- | --- | --- | --- |
| 1 | Trace | 0–3 | `0 - 3` | Light | No |
| 2 | Light | 3–25 | `3 - 25` | — | Yes (default threshold) |
| 3 | Moderate | 25–63 | `25 - 63` | Medium | Yes |
| 4 | Heavy | 63–158 | `63 - 158` | Heavy | Yes |
| 5 | Very heavy | > 158 | `158 - 1000` | — | Yes |

The exposure threshold can be raised to Moderate, Heavy or Very heavy in *Layers & filters*.

## 2. Spatial overlay

1. **Select zones in the analysis window.** *Selected hour* uses polygons valid at that hour. *24 h peak* and *48 h peak* use every hourly polygon from the selected hour forward, so a tract is classified at the **worst** level it reaches in the window. Replay uses the single observed snapshot.
2. **Dissolve per level.** Polygons of each level are simplified (`simplifyOperator`) and unioned (`unionOperator`) into one geometry per level, then prepared with `containsAccelerateGeometry`.
3. **Fetch candidate tracts (once per data set).** All zones across all hours are unioned, buffered by 0.03° and generalized (≤ 0.02° deviation). The result is a strict superset of the footprint, sent as the spatial filter of an `intersects` query against the ACS tract layer. The query returns attributes and the tract centroid only.
4. **Classify each tract by its centroid.** The tract is assigned the highest level whose dissolved footprint contains its centroid, testing Very heavy first. Tracts without a centroid hit are not exposed.

Centroid assignment counts each tract once (no double counting across bands or overlapping hours) and avoids partial-area estimates that would assume uniform population within a tract.

## 3. Exposure calculations

For tracts at or above the threshold:

- **Population exposed** = Σ `B01001_001E`
- **Children exposed** = Σ `B01001_calc_numLT18E` (under 18)
- **Adults 65+ exposed** = Σ `B01001_calc_numGE65E`
- Per-band totals use the same sums restricted to one level, plus counts of tracts, counties and states.

County rankings sum exposed tracts. Rates are population-weighted: mean risk score, and PM2.5 over tracts that have a monitor estimate.

## 4. Supporting factors

| Factor | Definition |
| --- | --- |
| Distance to wildfire | Great-circle distance from the tract centroid to the nearest active incident (U.S. or Canada, after filters), searched to 1,000 km |
| Nearby fire count | Incidents within 100 km |
| Hotspot density | Satellite detections within 50 km, within the selected age limit (24 h, 48 h or 7 days) |
| Smoke level | Section 2 |
| PM2.5 | Inverse-distance-weighted (power 2) mean of monitors within 50 km. Distances under 0.5 km are clamped to 0.5 km. With no monitor, the midpoint of the tract's smoke band, flagged as *forecast* |
| Child / senior share | Children ÷ population, 65+ ÷ population |
| Population density | Population ÷ land area (`ALAND`, km²) |

Radius searches use a uniform 0.5–1° grid index over lon/lat with exact haversine filtering.

## 5. Smoke Risk Score

Each factor is normalized to 0–1 by dividing by a saturation value and clamping, then weighted:

```
Fire (0–30)
  proximity   15 × max(0, 1 − distance_km / 150)
  fire count   7.5 × min(1, fires_within_100km / 5)
  hotspots     7.5 × min(1, hotspots_within_50km / 25)

Air (0–40)
  smoke level 20 × (level − 1) / 4                  (Trace = 0 … Very heavy = 20)
  PM2.5       20 × min(1, PM2.5 / 125.4)            (top of EPA "Unhealthy", 2024 breakpoints)

Vulnerability (0–30)
  children    10 × min(1, child_share / 0.30)
  seniors     10 × min(1, senior_share / 0.30)
  density     10 × min(1, log10(1 + density) / log10(1 + 10,000))

Smoke Risk Score = Fire + Air + Vulnerability   (0–100)
```

| Category | Score |
| --- | --- |
| Low | < 25 |
| Moderate | 25 – < 45 |
| High | 45 – < 65 |
| Extreme | ≥ 65 |

The **exposure index** in the detail panel is the Air component rescaled to 0–100.

Air carries the most weight because it measures what residents actually breathe. Fire factors capture escalation potential and nearby-fire smoke the forecast may miss. Vulnerability uses population *shares* so small and large tracts are comparable; absolute counts drive the rankings instead.

## 6. Observed vs. forecast air quality

For each monitor with valid PM2.5 (live: observations within ±2 hours of the selected hour):

1. Find the expected smoke level at the monitor from the selected hour's footprint.
2. Compare: **above** if PM2.5 > band maximum + 9 µg/m³ background (for no smoke or Trace, > 3 + 9). **Below** if expected level ≥ Moderate and PM2.5 < band minimum. Otherwise **within**.
3. Group monitors by plain-language region (state lookup). A region is reported when at least 4 monitors **and** at least 35% of its monitors share a verdict.

## 7. Automated findings

`analysis/insights.ts` builds sentences only from computed values: headline exposure, vulnerable populations, heaviest band and its states (ordered by exposed population), most-exposed county, High/Extreme tract counts, regional observed-vs-forecast divergence, the highest monitor reading (if above 35.4 µg/m³) and fire activity. Large numbers are rounded to two significant figures for readability (3,214,880 → "3.2 million").

## 8. Assumptions and limitations

- **Centroid assignment.** A tract is fully in or out of a smoke band. Large rural tracts on band edges can be misassigned. Area-weighted apportionment is a planned enhancement.
- **ACS estimates.** Counts are 5-year estimates with margins of error, not real-time population; daytime population is not modelled.
- **Smoke forecast vs. observation.** The NWS product is model output (HRRR-Smoke). HMS replay polygons are satellite column observations, so surface concentrations can be lower (smoke aloft) or higher. The observed-vs-forecast finding surfaces these differences.
- **Background PM2.5.** Smoke bands describe smoke-only PM2.5; the 9 µg/m³ allowance approximates non-smoke background. Local sources such as traffic and inversions can still exceed it.
- **Monitor coverage.** Where no monitor lies within 50 km, PM2.5 falls back to the band midpoint, which is coarser.
- **Canada.** Canadian fires inform U.S. risk factors, but Canadian residents are not counted (no forecast or demographic coverage).
- **Replay incidents.** Canadian incidents in replay are satellite-derived clusters, not agency records.
- **The score is a screening index**, intended for prioritization and situational awareness. It is not a health-risk model and does not replace official air-quality alerts.

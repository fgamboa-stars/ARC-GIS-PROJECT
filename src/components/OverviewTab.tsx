import { RISK_COLORS, RISK_ORDER } from "../config/risk";
import { EXPOSURE_LEVELS, formatSmokeBand, smokeInfo } from "../config/smoke";
import type { AnalysisResult, Conditions } from "../types/domain";
import { formatCompact, formatInt, formatPercent } from "../utils/format";
import { Notice, Section, Skeleton } from "./ui/primitives";

interface Props {
  conditions: Conditions | null;
  result: AnalysisResult | null;
  loading: boolean;
}

function Kpi(props: { label: string; value: number | null; detail?: string }) {
  return (
    <div className="kpi">
      <span className="kpi__label">{props.label}</span>
      <span className="kpi__value">{props.value === null ? "—" : formatCompact(props.value)}</span>
      {props.detail && <span className="kpi__detail">{props.detail}</span>}
    </div>
  );
}

export function OverviewTab({ conditions, result, loading }: Props) {
  const total = result?.summary.total;
  const thresholdLabel = result ? smokeInfo(result.summary.threshold).label : "Light";
  const share = (n: number) => (total && total.population > 0 ? formatPercent(n / total.population) : undefined);

  return (
    <div className="tab-body">
      <Section
        title="Exposure"
        id="exposure-heading"
        aside={result && <span className="muted small">{result.windowLabel}</span>}
      >
        <div className="kpi-grid" aria-live="polite">
          <Kpi label="Residents in smoke" value={total?.population ?? null} detail={`${thresholdLabel} or heavier`} />
          <Kpi
            label="Children under 18"
            value={total?.children ?? null}
            detail={total ? `${share(total.children) ?? "—"} of exposed` : undefined}
          />
          <Kpi
            label="Adults 65+"
            value={total?.seniors ?? null}
            detail={total ? `${share(total.seniors) ?? "—"} of exposed` : undefined}
          />
          <Kpi
            label="Census tracts"
            value={total?.tracts ?? null}
            detail={
              total ? `${formatInt(total.counties)} counties · ${formatInt(total.states.length)} states` : undefined
            }
          />
        </div>
        {result?.truncated && (
          <Notice tone="warning">Tract results reached the query limit; totals are a lower bound.</Notice>
        )}
      </Section>

      {result && result.summary.total.population > 0 && (
        <Section title="Smoke severity" id="severity-heading">
          <SeverityBars result={result} />
        </Section>
      )}

      {result && result.summary.total.tracts > 0 && (
        <Section title="Smoke Risk Score" id="risk-heading" aside={<span className="muted small">exposed tracts</span>}>
          <ul className="risk-dist">
            {[...RISK_ORDER].reverse().map((c) => {
              const n = result.summary.riskCounts[c];
              const pct = result.summary.total.tracts > 0 ? n / result.summary.total.tracts : 0;
              return (
                <li key={c}>
                  <span className="swatch" style={{ background: RISK_COLORS[c] }} aria-hidden="true" />
                  <span className="risk-dist__label">{c}</span>
                  <span className="bar-track" aria-hidden="true">
                    <span className="bar-fill" style={{ width: `${(pct * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="num">{formatInt(n)}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Automated findings" id="findings-heading">
        {loading && !result ? (
          <Skeleton lines={4} />
        ) : result ? (
          <ul className="findings">
            {result.findings.map((f) => (
              <li key={f.id} className={`finding finding--${f.tone}`}>
                {f.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Findings appear once the analysis completes.</p>
        )}
      </Section>

      {conditions && (
        <Section title="Data" id="data-heading">
          <dl className="facts">
            <dt>Smoke zones</dt>
            <dd>
              {formatInt(conditions.smoke.length)} polygons ·{" "}
              {conditions.smokeKind === "forecast"
                ? `${formatInt(conditions.smokeTimes.length)} forecast hours`
                : "observed (NOAA HMS)"}
            </dd>
            <dt>Active fires</dt>
            <dd>{formatInt(conditions.fires.length)}</dd>
            <dt>Hotspots</dt>
            <dd>{formatInt(conditions.hotspots.length)}</dd>
            <dt>PM2.5 monitors</dt>
            <dd>{formatInt(conditions.stations.filter((s) => s.pm25 !== null).length)}</dd>
            {result && (
              <>
                <dt>Overlay</dt>
                <dd>{formatInt(result.durationMs)} ms in browser</dd>
              </>
            )}
          </dl>
          {conditions.warnings.map((w) => (
            <Notice key={w} tone="warning">
              {w}
            </Notice>
          ))}
        </Section>
      )}
    </div>
  );
}

function SeverityBars({ result }: { result: AnalysisResult }) {
  const levels = EXPOSURE_LEVELS.filter((l) => l >= result.summary.threshold);
  const max = Math.max(...levels.map((l) => result.summary.byLevel[l].population), 1);
  return (
    <ul className="severity">
      {[...levels].reverse().map((l) => {
        const t = result.summary.byLevel[l];
        return (
          <li
            key={l}
            title={`${formatSmokeBand(l)}: ${formatInt(t.population)} residents, ${formatInt(t.children)} children, ${formatInt(t.seniors)} adults 65+`}
          >
            <span className={`smoke-chip smoke-chip--${l.toString()}`} aria-hidden="true" />
            <span className="severity__label">
              {smokeInfo(l).label}
              <span className="muted small">
                {" "}
                {l === 5
                  ? `${smokeInfo(l).min.toString()}+`
                  : `${smokeInfo(l).min.toString()}–${smokeInfo(l).max.toString()}`}{" "}
                µg/m³
              </span>
            </span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${((t.population / max) * 100).toFixed(1)}%` }} />
            </span>
            <span className="num">{formatCompact(t.population)}</span>
          </li>
        );
      })}
    </ul>
  );
}

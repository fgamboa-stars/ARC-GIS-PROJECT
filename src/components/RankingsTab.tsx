import { useMemo, useState } from "react";
import { isExposed } from "../analysis/exposure";
import { RANKING_KINDS, type RankingScope, rankCommunities, rankingValue } from "../analysis/rankings";
import { RISK_COLORS } from "../config/risk";
import { smokeInfo } from "../config/smoke";
import type { AnalysisResult, CommunityRank, RankingKind } from "../types/domain";
import { formatInt } from "../utils/format";
import { Segmented } from "./ui/primitives";

interface Props {
  result: AnalysisResult | null;
  onFocus: (rank: CommunityRank) => void;
}

function display(kind: RankingKind, r: CommunityRank): string {
  const v = rankingValue(kind, r);
  if (v === null) return "—";
  if (kind === "air") return v.toFixed(1);
  if (kind === "risk") return v.toFixed(0);
  return formatInt(v);
}

export function RankingsTab({ result, onFocus }: Props) {
  const [kind, setKind] = useState<RankingKind>("exposure");
  const [scope, setScope] = useState<RankingScope>("county");

  const rows = useMemo(() => {
    if (!result) return [];
    const exposed = result.assessments.filter((a) => isExposed(a, result.summary.threshold));
    return rankCommunities(exposed, kind, scope, 15);
  }, [result, kind, scope]);

  const meta = RANKING_KINDS.find((k) => k.kind === kind)!;
  const max = Math.max(...rows.map((r) => rankingValue(kind, r) ?? 0), 1);

  return (
    <div className="tab-body">
      <div className="rank-controls">
        <label className="select select--block">
          <span className="visually-hidden">Ranking</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as RankingKind);
            }}
          >
            {RANKING_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label="Community scale"
          size="sm"
          value={scope}
          options={[
            { value: "county", label: "Counties" },
            { value: "tract", label: "Tracts" },
          ]}
          onChange={setScope}
        />
      </div>

      {rows.length === 0 ? (
        <p className="muted">
          {result
            ? kind === "air"
              ? "No exposed communities have a PM2.5 monitor nearby."
              : "No communities are exposed at the current threshold."
            : "Waiting for analysis…"}
        </p>
      ) : (
        <ol className="ranking" aria-label={`${meta.label} — ${meta.metric}`}>
          <li className="ranking__head" aria-hidden="true">
            <span>Community</span>
            <span>{meta.metric}</span>
          </li>
          {rows.map((r, i) => (
            <li key={r.key}>
              <button
                type="button"
                className="ranking__row"
                onClick={() => {
                  onFocus(r);
                }}
              >
                <span className="ranking__pos">{i + 1}</span>
                <span className="ranking__name">
                  <strong>{r.label}</strong>
                  <span className="muted small">
                    {r.sublabel} · {smokeInfo(r.maxLevel).label} smoke ·{" "}
                    <span className="risk-tag" style={{ borderColor: RISK_COLORS[r.riskCategory] }}>
                      {r.riskCategory}
                    </span>
                  </span>
                  <span className="bar-track bar-track--thin" aria-hidden="true">
                    <span
                      className="bar-fill"
                      style={{ width: `${(((rankingValue(kind, r) ?? 0) / max) * 100).toFixed(1)}%` }}
                    />
                  </span>
                </span>
                <span className="num">{display(kind, r)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">
        County figures sum exposed tracts only. PM2.5 uses monitors within 50 km, population-weighted. Select a row to
        zoom.
      </p>
    </div>
  );
}

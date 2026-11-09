import { RISK_COLORS, RISK_WEIGHTS, aqiCategoryForPm25 } from "../config/risk";
import { formatSmokeBand } from "../config/smoke";
import type { CommunityDetail } from "../hooks/useCommunity";
import { formatInt, formatKm, formatPercent, formatPm } from "../utils/format";
import { IconButton, Icon, Notice, Skeleton } from "./ui/primitives";

interface Props {
  detail: CommunityDetail | null;
  loading: boolean;
  error: Error | null;
  smokeKind: "forecast" | "observed";
  onClose: () => void;
  onZoom: (lon: number, lat: number) => void;
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="meter">
      <div className="meter__head">
        <span>{label}</span>
        <span className="num">
          {value.toFixed(1)} <span className="muted">/ {max}</span>
        </span>
      </div>
      <span className="bar-track" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${((value / max) * 100).toFixed(1)}%` }} />
      </span>
    </div>
  );
}

export function CommunityPanel({ detail, loading, error, smokeKind, onClose, onZoom }: Props) {
  const fireMax = RISK_WEIGHTS.fire.proximity + RISK_WEIGHTS.fire.count + RISK_WEIGHTS.fire.hotspots;
  const airMax = RISK_WEIGHTS.air.smoke + RISK_WEIGHTS.air.pm25;
  const vulnMax =
    RISK_WEIGHTS.vulnerability.children + RISK_WEIGHTS.vulnerability.seniors + RISK_WEIGHTS.vulnerability.density;

  return (
    <aside className="community" aria-label="Community detail">
      <header className="community__head">
        <div>
          <span className="eyebrow">Community detail</span>
          <h2>{detail ? detail.assessment.tract.name : "Census tract"}</h2>
          {detail && (
            <p className="muted">
              {detail.assessment.tract.county}, {detail.assessment.tract.state}
            </p>
          )}
        </div>
        <IconButton icon="close" label="Close community detail" onClick={onClose} />
      </header>

      {error && <Notice tone="error">Could not load this tract: {error.message}</Notice>}
      {loading && !detail && <Skeleton lines={6} />}
      {!loading && !detail && !error && <p className="muted">No population data for this tract.</p>}

      {detail &&
        (() => {
          const { tract, factors, risk } = detail.assessment;
          const aqi = factors.pm25 !== null ? aqiCategoryForPm25(factors.pm25) : null;
          return (
            <div className="community__body">
              <div className="score" style={{ borderColor: RISK_COLORS[risk.category] }}>
                <div>
                  <span className="eyebrow">Smoke Risk Score</span>
                  <div className="score__value">
                    {risk.total.toFixed(0)}
                    <span className="muted"> / 100</span>
                  </div>
                </div>
                <span className="score__cat" style={{ background: RISK_COLORS[risk.category] }}>
                  {risk.category}
                </span>
              </div>
              <Meter label="Fire factors" value={risk.fire} max={fireMax} />
              <Meter label="Air factors (exposure)" value={risk.air} max={airMax} />
              <Meter label="Vulnerability factors" value={risk.vulnerability} max={vulnMax} />

              <h3>Location</h3>
              <dl className="facts">
                <dt>Tract (GEOID)</dt>
                <dd className="mono">{tract.geoid}</dd>
                <dt>Population</dt>
                <dd>{formatInt(tract.population)}</dd>
                <dt>Density</dt>
                <dd>{formatInt(factors.densityPerKm2)} / km²</dd>
              </dl>

              <h3>Smoke</h3>
              <dl className="facts">
                <dt>{smokeKind === "forecast" ? "Forecast category" : "Observed category"}</dt>
                <dd>{formatSmokeBand(factors.smokeLevel)}</dd>
                <dt>PM2.5</dt>
                <dd>
                  {formatPm(factors.pm25)}
                  {aqi && <span className="muted"> · {aqi.label}</span>}
                  <div className="muted small">
                    {factors.pm25Source === "monitor"
                      ? "Interpolated from monitors within 50 km"
                      : factors.pm25Source === "forecast"
                        ? "No monitor within 50 km — smoke band midpoint"
                        : "No monitor within 50 km"}
                  </div>
                </dd>
                <dt>Exposure index</dt>
                <dd>{risk.exposureIndex} / 100</dd>
              </dl>

              <h3>Vulnerability</h3>
              <dl className="facts">
                <dt>Children under 18</dt>
                <dd>
                  {formatInt(tract.children)} <span className="muted">({formatPercent(factors.childShare)})</span>
                </dd>
                <dt>Adults 65+</dt>
                <dd>
                  {formatInt(tract.seniors)} <span className="muted">({formatPercent(factors.seniorShare)})</span>
                </dd>
              </dl>

              <h3>Nearby fires</h3>
              <dl className="facts">
                <dt>Nearest fire</dt>
                <dd>{formatKm(factors.nearestFireKm)}</dd>
                <dt>Fires within 100 km</dt>
                <dd>{formatInt(factors.firesWithin100Km)}</dd>
                <dt>Hotspots within 50 km</dt>
                <dd>{formatInt(factors.hotspotsWithin50Km)}</dd>
              </dl>
              {detail.nearbyFires.length > 0 && (
                <ul className="fire-list">
                  {detail.nearbyFires.map(({ fire, distanceKm }) => (
                    <li key={fire.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onZoom(fire.lon, fire.lat);
                        }}
                      >
                        <span>
                          <strong>{fire.name}</strong>
                          <span className="muted small">
                            {" "}
                            {fire.jurisdiction ?? fire.country}
                            {fire.acres !== null ? ` · ${formatInt(fire.acres)} ac` : ""}
                            {fire.percentContained !== null ? ` · ${formatInt(fire.percentContained)}% contained` : ""}
                          </span>
                        </span>
                        <span className="num">{formatKm(distanceKm)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!detail.inSmoke && (
                <Notice tone="info">
                  This tract is outside the {smokeKind === "forecast" ? "forecast" : "observed"} smoke footprint for the
                  selected window.
                </Notice>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onZoom(tract.lon, tract.lat);
                }}
              >
                <Icon name="target" size={16} /> Zoom to tract
              </button>
            </div>
          );
        })()}
    </aside>
  );
}

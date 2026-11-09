import { useState } from "react";
import { AQI_CATEGORIES, RISK_COLORS, RISK_ORDER } from "../config/risk";
import { SMOKE_LEVELS } from "../config/smoke";

/** Compact legend for the data-bearing colors on the map. */
export function MapLegend() {
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 821px)").matches);
  return (
    <div className="map-card legend">
      <button
        type="button"
        className="legend__toggle"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        Legend
      </button>
      {open && (
        <div className="legend__body">
          <div className="legend__group">
            <span className="legend__title">Smoke (PM2.5 µg/m³)</span>
            <div className="legend__ramp">
              {SMOKE_LEVELS.slice(1).map((s) => (
                <span key={s.level} className="legend__step">
                  <span className={`smoke-chip smoke-chip--${s.level.toString()}`} />
                  <span className="small">{s.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="legend__group">
            <span className="legend__title">Smoke Risk Score</span>
            <div className="legend__ramp">
              {RISK_ORDER.map((c) => (
                <span key={c} className="legend__step">
                  <span className="dot" style={{ background: RISK_COLORS[c] }} />
                  <span className="small">{c}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="legend__group">
            <span className="legend__title">PM2.5 monitors (EPA AQI)</span>
            <div className="legend__ramp legend__ramp--wrap">
              {AQI_CATEGORIES.map((c) => (
                <span key={c.label} className="legend__step">
                  <span className="dot dot--ring" style={{ background: c.color }} />
                  <span className="small">{c.label === "Unhealthy for Sensitive Groups" ? "USG" : c.label}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="legend__group legend__symbols small">
            <span>
              <span className="sym sym--tri" /> U.S. fire
            </span>
            <span>
              <span className="sym sym--dia" /> Canadian fire
            </span>
            <span>
              <span className="sym sym--hot" /> Hotspot
            </span>
            <span>
              <span className="sym sym--perim" /> Perimeter
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

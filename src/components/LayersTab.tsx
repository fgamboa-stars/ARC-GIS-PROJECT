import { RISK_ORDER, type RiskCategory } from "../config/risk";
import { EXPOSURE_LEVELS, type ExposureLevel, smokeInfo } from "../config/smoke";
import { LAYER_DEFS, type LayerGroup } from "../map/layers";
import type { TractShading } from "../map/symbology";
import { useAppState, useDispatch } from "../state/context";
import { Section, Segmented } from "./ui/primitives";

const GROUPS: readonly LayerGroup[] = ["Smoke & air quality", "Wildfires", "Communities"];

export function LayersTab() {
  const state = useAppState();
  const dispatch = useDispatch();
  const f = state.filters;

  return (
    <div className="tab-body">
      <Section title="Analysis filters" id="filters-heading">
        <div className="field">
          <span className="field__label" id="thr-label">
            Count exposure at
          </span>
          <Segmented
            label="Exposure threshold"
            size="sm"
            value={String(f.exposureThreshold)}
            options={EXPOSURE_LEVELS.map((l) => ({ value: String(l), label: `${smokeInfo(l).label}+` }))}
            onChange={(v) => {
              dispatch({ type: "setFilters", filters: { exposureThreshold: Number(v) as ExposureLevel } });
            }}
          />
        </div>
        <div className="field">
          <span className="field__label">Satellite hotspots from the past</span>
          <Segmented
            label="Hotspot age"
            size="sm"
            value={String(f.hotspotMaxAgeHours)}
            options={[
              { value: "24", label: "24 h" },
              { value: "48", label: "48 h" },
              { value: "168", label: "7 days" },
            ]}
            onChange={(v) => {
              dispatch({ type: "setFilters", filters: { hotspotMaxAgeHours: Number(v) } });
            }}
          />
        </div>
        <label className="field field--row">
          <span className="field__label">Minimum fire size</span>
          <select
            value={f.minFireAcres}
            onChange={(e) => {
              dispatch({ type: "setFilters", filters: { minFireAcres: Number(e.target.value) } });
            }}
          >
            {[0, 100, 1000, 10000, 100000].map((a) => (
              <option key={a} value={a}>
                {a === 0 ? "Any size" : `${a.toLocaleString()} acres`}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--row check">
          <input
            type="checkbox"
            checked={f.includeContained}
            onChange={(e) => {
              dispatch({ type: "setFilters", filters: { includeContained: e.target.checked } });
            }}
          />
          <span>Include 100% contained U.S. fires</span>
        </label>
        <label className="field field--row">
          <span className="field__label">Show risk points from</span>
          <select
            value={state.minRiskCategory}
            onChange={(e) => {
              dispatch({ type: "setMinRisk", category: e.target.value as RiskCategory });
            }}
          >
            {RISK_ORDER.map((c) => (
              <option key={c} value={c}>
                {c}
                {c === "Extreme" ? "" : " and above"}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--row">
          <span className="field__label">Shade census tracts by</span>
          <select
            value={state.tractShading}
            onChange={(e) => {
              dispatch({ type: "setTractShading", shading: e.target.value as TractShading });
            }}
          >
            <option value="none">Outline only</option>
            <option value="children">% under 18</option>
            <option value="seniors">% 65 and older</option>
          </select>
        </label>
        <p className="muted small">Fire and hotspot filters also change the fire factors of the risk score.</p>
      </Section>

      {GROUPS.map((group) => (
        <Section key={group} title={group} id={`group-${group}`}>
          <ul className="layer-list">
            {LAYER_DEFS.filter((d) => d.group === group).map((d) => {
              const s = state.layers[d.id];
              const unavailable = d.liveOnly === true && state.mode === "replay";
              return (
                <li key={d.id} className={unavailable ? "is-disabled" : undefined}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.visible && !unavailable}
                      disabled={unavailable}
                      onChange={(e) => {
                        dispatch({ type: "setLayer", id: d.id, setting: { visible: e.target.checked } });
                      }}
                    />
                    <span>
                      <span className="layer-list__title">{d.title}</span>
                      <span className="muted small">{unavailable ? "Live mode only" : d.description}</span>
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={s.opacity}
                    disabled={!s.visible || unavailable}
                    aria-label={`${d.title} opacity`}
                    onChange={(e) => {
                      dispatch({ type: "setLayer", id: d.id, setting: { opacity: Number(e.target.value) } });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
    </div>
  );
}

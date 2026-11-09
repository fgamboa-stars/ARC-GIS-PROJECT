import type { WindowKind } from "../analysis/pipeline";
import { useAppState, useDispatch } from "../state/context";
import type { Conditions } from "../types/domain";
import type { ConditionsSnapshot } from "../types/snapshot";
import { formatDateTime } from "../utils/format";
import { Segmented } from "./ui/primitives";

interface Props {
  conditions: Conditions | null;
  snapshot: ConditionsSnapshot | null;
}

/** Forecast hour slider and analysis window (Live); event summary (Replay). */
export function TimeControl({ conditions, snapshot }: Props) {
  const { mode, windowKind, smokeTime } = useAppState();
  const dispatch = useDispatch();

  if (mode === "replay") {
    if (!snapshot) return null;
    return (
      <div className="map-card time-control">
        <div className="time-control__row">
          <strong>{snapshot.title}</strong>
          <span className="muted">{snapshot.subtitle}</span>
        </div>
        <p className="small muted">{snapshot.description}</p>
      </div>
    );
  }

  const times = conditions?.smokeTimes ?? [];
  if (times.length === 0 || smokeTime === null) return null;
  const index = Math.max(0, times.indexOf(smokeTime));
  const hoursAhead = Math.round((smokeTime - (conditions?.referenceTime ?? smokeTime)) / 3_600_000);

  return (
    <div className="map-card time-control">
      <div className="time-control__row">
        <Segmented<WindowKind>
          label="Analysis window"
          size="sm"
          value={windowKind}
          options={[
            { value: "hour", label: "Selected hour" },
            { value: "24h", label: "24 h peak" },
            { value: "48h", label: "48 h peak" },
          ]}
          onChange={(kind) => {
            dispatch({ type: "setWindowKind", kind });
          }}
        />
        <output className="time-control__label" htmlFor="forecast-hour">
          {formatDateTime(smokeTime)}
          <span className="muted small">
            {" "}
            {hoursAhead === 0 ? "now" : hoursAhead > 0 ? `+${hoursAhead.toString()} h` : `${hoursAhead.toString()} h`}
          </span>
        </output>
      </div>
      <input
        id="forecast-hour"
        type="range"
        min={0}
        max={times.length - 1}
        step={1}
        value={index}
        aria-label="Forecast hour"
        aria-valuetext={formatDateTime(smokeTime)}
        onChange={(e) => {
          const t = times[Number(e.target.value)];
          if (t !== undefined) dispatch({ type: "setSmokeTime", time: t });
        }}
      />
      <div className="time-control__ticks muted small" aria-hidden="true">
        <span>{formatDateTime(times[0]!, { hour: "numeric", minute: undefined })}</span>
        <span>NWS hourly smoke forecast</span>
        <span>{formatDateTime(times[times.length - 1]!, { hour: "numeric", minute: undefined })}</span>
      </div>
    </div>
  );
}

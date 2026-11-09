import { type AnalysisFilters, type AnalysisWindow, DEFAULT_FILTERS, type WindowKind } from "../analysis/pipeline";
import type { RiskCategory } from "../config/risk";
import { LAYER_DEFS, type LayerId } from "../map/layers";
import type { TractShading } from "../map/symbology";
import type { Mode } from "../types/domain";
import type { ConditionsSnapshot } from "../types/snapshot";

export type SidebarTab = "overview" | "rankings" | "layers";

export interface LayerSetting {
  visible: boolean;
  opacity: number;
}

export interface AppState {
  mode: Mode;
  replayId: string | null;
  /** A user-loaded snapshot file (takes precedence over replayId). */
  uploadedSnapshot: ConditionsSnapshot | null;
  windowKind: WindowKind;
  /** Selected forecast hour; null until conditions load. */
  smokeTime: number | null;
  filters: AnalysisFilters;
  minRiskCategory: RiskCategory;
  layers: Record<LayerId, LayerSetting>;
  tractShading: TractShading;
  selectedGeoid: string | null;
  tab: SidebarTab;
  refreshToken: number;
}

export type Action =
  | { type: "setMode"; mode: Mode }
  | { type: "setReplay"; id: string }
  | { type: "loadSnapshot"; snapshot: ConditionsSnapshot }
  | { type: "setWindowKind"; kind: WindowKind }
  | { type: "setSmokeTime"; time: number }
  | { type: "setFilters"; filters: Partial<AnalysisFilters> }
  | { type: "setMinRisk"; category: RiskCategory }
  | { type: "setLayer"; id: LayerId; setting: Partial<LayerSetting> }
  | { type: "setTractShading"; shading: TractShading }
  | { type: "select"; geoid: string | null }
  | { type: "setTab"; tab: SidebarTab }
  | { type: "refresh" };

export const initialState: AppState = {
  mode: "live",
  replayId: null,
  uploadedSnapshot: null,
  windowKind: "24h",
  smokeTime: null,
  filters: DEFAULT_FILTERS,
  minRiskCategory: "Low",
  layers: Object.fromEntries(
    LAYER_DEFS.map((d) => [d.id, { visible: d.defaultVisible, opacity: d.defaultOpacity }]),
  ) as Record<LayerId, LayerSetting>,
  tractShading: "none",
  selectedGeoid: null,
  tab: "overview",
  refreshToken: 0,
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setMode":
      return state.mode === action.mode ? state : { ...state, mode: action.mode, selectedGeoid: null, smokeTime: null };
    case "setReplay":
      return {
        ...state,
        mode: "replay",
        replayId: action.id,
        uploadedSnapshot: null,
        selectedGeoid: null,
        smokeTime: null,
      };
    case "loadSnapshot":
      return {
        ...state,
        mode: "replay",
        uploadedSnapshot: action.snapshot,
        replayId: null,
        selectedGeoid: null,
        smokeTime: null,
      };
    case "setWindowKind":
      return { ...state, windowKind: action.kind };
    case "setSmokeTime":
      return { ...state, smokeTime: action.time };
    case "setFilters":
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case "setMinRisk":
      return { ...state, minRiskCategory: action.category };
    case "setLayer":
      return { ...state, layers: { ...state.layers, [action.id]: { ...state.layers[action.id], ...action.setting } } };
    case "setTractShading":
      return { ...state, tractShading: action.shading };
    case "select":
      return { ...state, selectedGeoid: action.geoid };
    case "setTab":
      return { ...state, tab: action.tab };
    case "refresh":
      return { ...state, refreshToken: state.refreshToken + 1 };
  }
}

export function analysisWindow(state: AppState): AnalysisWindow | null {
  return state.smokeTime === null ? null : { kind: state.windowKind, start: state.smokeTime };
}

import ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer";
import UniqueValueRenderer from "@arcgis/core/renderers/UniqueValueRenderer";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import { AQI_CATEGORIES, RISK_COLORS, RISK_ORDER } from "../config/risk";
import { SMOKE_FILL, SMOKE_LEVELS, type SmokeLevel } from "../config/smoke";
import type { Theme } from "../hooks/useTheme";

/** Renderers, keyed by theme where the basemap contrast requires it. */

const INK: Record<Theme, [number, number, number]> = { light: [17, 17, 17], dark: [240, 239, 236] };
const PAPER: Record<Theme, [number, number, number]> = { light: [255, 255, 255], dark: [20, 20, 20] };

export function smokeRenderer(theme: Theme): UniqueValueRenderer {
  return new UniqueValueRenderer({
    field: "smoke_classdesc",
    uniqueValueInfos: SMOKE_LEVELS.filter((s) => s.classDesc).map((s) => ({
      value: s.classDesc!,
      label:
        s.level === 5
          ? `${s.label} (>${s.min.toString()} µg/m³)`
          : `${s.label} (${s.min.toString()}–${s.max.toString()} µg/m³)`,
      symbol: new SimpleFillSymbol({ color: SMOKE_FILL[theme][s.level], outline: { color: [0, 0, 0, 0], width: 0 } }),
    })),
  });
}

export function footprintSymbol(theme: Theme, level: SmokeLevel): SimpleFillSymbol {
  return new SimpleFillSymbol({
    color: [0, 0, 0, 0],
    outline: {
      color: [...INK[theme], 0.35 + level * 0.12],
      width: level >= 4 ? 1.6 : 1,
      style: level >= 3 ? "solid" : "dash",
    },
  });
}

export function fireRenderer(theme: Theme, country: "US" | "CA"): SimpleRenderer {
  return new SimpleRenderer({
    symbol: new SimpleMarkerSymbol({
      style: country === "US" ? "triangle" : "diamond",
      size: 11,
      color: [196, 40, 28, 1],
      outline: { color: PAPER[theme], width: 1.2 },
    }),
    label: country === "US" ? "U.S. incident" : "Canadian fire",
  });
}

export function perimeterRenderer(theme: Theme): SimpleRenderer {
  return new SimpleRenderer({
    symbol: new SimpleFillSymbol({
      color: [196, 40, 28, theme === "dark" ? 0.25 : 0.18],
      outline: { color: [196, 40, 28, 0.9], width: 1 },
    }),
    label: "Fire perimeter",
  });
}

export function hotspotRenderer(): SimpleRenderer {
  return new SimpleRenderer({
    symbol: new SimpleMarkerSymbol({
      style: "circle",
      size: 4,
      color: [255, 120, 20, 0.85],
      outline: { width: 0, color: [0, 0, 0, 0] },
    }),
    label: "Satellite detection",
  });
}

export function stationRenderer(theme: Theme): ClassBreaksRenderer {
  let min = -1;
  return new ClassBreaksRenderer({
    field: "PM25",
    classBreakInfos: AQI_CATEGORIES.map((c) => {
      const info = {
        minValue: min,
        maxValue: Number.isFinite(c.maxPm25) ? c.maxPm25 : 100000,
        label: c.label,
        symbol: new SimpleMarkerSymbol({ size: 7, color: c.color, outline: { color: INK[theme], width: 0.5 } }),
      };
      min = c.maxPm25;
      return info;
    }),
  });
}

export function aqiContourRenderer(): UniqueValueRenderer {
  return new UniqueValueRenderer({
    field: "gridcode",
    uniqueValueInfos: AQI_CATEGORIES.map((c, i) => ({
      value: i + 1,
      label: c.label,
      symbol: new SimpleFillSymbol({ color: `${c.color}55`, outline: { width: 0, color: [0, 0, 0, 0] } }),
    })),
  });
}

export type TractShading = "none" | "children" | "seniors";

export function tractRenderer(theme: Theme, shading: TractShading): SimpleRenderer | ClassBreaksRenderer {
  const outline = { color: [...INK[theme], 0.28] as [number, number, number, number], width: 0.4 };
  if (shading === "none") {
    return new SimpleRenderer({
      symbol: new SimpleFillSymbol({ color: [0, 0, 0, 0], outline }),
      label: "Census tract",
    });
  }
  const field = shading === "children" ? "B01001_calc_pctLT18E" : "B01001_calc_pctGE65E";
  const breaks = shading === "children" ? [0, 15, 20, 25, 30, 100] : [0, 12, 17, 22, 28, 100];
  return new ClassBreaksRenderer({
    field,
    classBreakInfos: breaks.slice(0, -1).map((b, i) => ({
      minValue: b,
      maxValue: breaks[i + 1]!,
      label: i === breaks.length - 2 ? `${b.toString()}%+` : `${b.toString()}–${breaks[i + 1]!.toString()}%`,
      symbol: new SimpleFillSymbol({ color: [...INK[theme], 0.04 + i * 0.07], outline }),
    })),
  });
}

export function riskRenderer(theme: Theme): UniqueValueRenderer {
  return new UniqueValueRenderer({
    field: "category",
    uniqueValueInfos: RISK_ORDER.map((c, i) => ({
      value: c,
      label: c,
      symbol: new SimpleMarkerSymbol({
        size: 5 + i * 1.5,
        color: RISK_COLORS[c],
        outline: { color: PAPER[theme], width: 0.5 },
      }),
    })),
  });
}

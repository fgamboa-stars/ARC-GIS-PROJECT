import { useCallback, useEffect, useState } from "react";
import darkCss from "@arcgis/core/assets/esri/themes/dark/main.css?url";
import lightCss from "@arcgis/core/assets/esri/themes/light/main.css?url";

export type Theme = "light" | "dark";

const STORAGE_KEY = "smoke-dashboard-theme";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** App theme: sets `data-theme` on <html> and swaps the ArcGIS SDK stylesheet. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    let link = document.getElementById("arcgis-theme") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = "arcgis-theme";
      link.rel = "stylesheet";
      document.head.prepend(link);
    }
    link.href = theme === "dark" ? darkCss : lightCss;
    document.body.classList.toggle("calcite-mode-dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);
  return [theme, toggle];
}

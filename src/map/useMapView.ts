import EsriMap from "@arcgis/core/Map";
import esriConfig from "@arcgis/core/config";
import MapView from "@arcgis/core/views/MapView";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Theme } from "../hooks/useTheme";
import { basemapFor, setBasemap } from "./sync";

const apiKey = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
if (apiKey) esriConfig.apiKey = apiKey;

/**
 * Creates the MapView when its container mounts (via a callback ref) and
 * destroys it on unmount. Theme changes swap the basemap in place.
 */
export function useMapView(theme: Theme): {
  containerRef: (el: HTMLDivElement | null) => () => void;
  view: MapView | null;
} {
  const [view, setView] = useState<MapView | null>(null);
  const initialTheme = useRef(theme);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return () => undefined;
    const mv = new MapView({
      container: el,
      map: new EsriMap({ basemap: basemapFor(initialTheme.current) }),
      center: [-97, 42],
      zoom: 4,
      constraints: { minZoom: 2, snapToZoom: false },
      attributionVisible: true,
      popup: { dockEnabled: false, dockOptions: { buttonEnabled: false, breakpoint: false } },
    });
    setView(mv);
    return () => {
      setView(null);
      mv.destroy();
    };
  }, []);

  useEffect(() => {
    if (view) setBasemap(view, theme);
  }, [view, theme]);

  return { containerRef, view };
}

import Point from "@arcgis/core/geometry/Point";
import Polygon from "@arcgis/core/geometry/Polygon";
import * as bufferOperator from "@arcgis/core/geometry/operators/bufferOperator";
import * as containsOperator from "@arcgis/core/geometry/operators/containsOperator";
import * as generalizeOperator from "@arcgis/core/geometry/operators/generalizeOperator";
import * as simplifyOperator from "@arcgis/core/geometry/operators/simplifyOperator";
import * as unionOperator from "@arcgis/core/geometry/operators/unionOperator";
import { EXPOSURE_LEVELS, type ExposureLevel, type SmokeLevel } from "../config/smoke";
import type { EsriPolygonJSON, SmokeZone } from "../types/domain";

/**
 * Smoke overlay built on the ArcGIS geometry operators (the client-side
 * geometry engine). Zones are dissolved per severity level so each point test
 * is at most four accelerated `contains` checks, regardless of how many
 * hourly forecast polygons fall in the analysis window.
 */

const WGS84 = { wkid: 4326 };

function toPolygon(json: EsriPolygonJSON): Polygon {
  return new Polygon({ rings: json.rings, spatialReference: WGS84 });
}

function asPolygon(g: unknown): Polygon | null {
  return g instanceof Polygon && g.rings.length > 0 ? g : null;
}

function dissolve(polys: Polygon[]): Polygon | null {
  if (polys.length === 0) return null;
  const simple = simplifyOperator
    .simplifyExecuteMany(polys)
    .map(asPolygon)
    .filter((p): p is Polygon => p !== null);
  if (simple.length === 0) return null;
  return asPolygon(simple.length === 1 ? simple[0] : unionOperator.unionExecuteMany(simple));
}

export function zonesInWindow(zones: readonly SmokeZone[], start: number, end: number): SmokeZone[] {
  return zones.filter((z) => z.validTime >= start && z.validTime <= end);
}

export class SmokeFootprint {
  /** Dissolved polygon per exposure level (exclusive of other levels). */
  readonly byLevel = new Map<ExposureLevel, Polygon>();

  constructor(zones: readonly SmokeZone[]) {
    for (const level of EXPOSURE_LEVELS) {
      const poly = dissolve(zones.filter((z) => z.level === level).map((z) => toPolygon(z.geometry)));
      if (poly) {
        containsOperator.containsAccelerateGeometry(poly);
        this.byLevel.set(level, poly);
      }
    }
  }

  get isEmpty(): boolean {
    return this.byLevel.size === 0;
  }

  /** Highest smoke level whose footprint contains the point (0 if none). */
  levelAt(lon: number, lat: number): SmokeLevel {
    if (this.isEmpty) return 0;
    const pt = new Point({ x: lon, y: lat, spatialReference: WGS84 });
    for (let i = EXPOSURE_LEVELS.length - 1; i >= 0; i--) {
      const level = EXPOSURE_LEVELS[i]!;
      const poly = this.byLevel.get(level);
      if (poly && containsOperator.containsExecute(poly, pt)) return level;
    }
    return 0;
  }
}

/**
 * Generalized union of every zone, used as the spatial filter when querying
 * census tracts. The union is buffered (~3 km) and then generalized (≤2 km
 * deviation), so it is a strict superset of the exact footprint with a small
 * POST body; tract centroids are re-tested against the exact footprint.
 */
export function queryFootprint(zones: readonly SmokeZone[]): EsriPolygonJSON | null {
  const all = dissolve(zones.map((z) => toPolygon(z.geometry)));
  if (!all) return null;
  const padded = asPolygon(bufferOperator.bufferExecute(all, 0.03)) ?? all;
  const general =
    asPolygon(generalizeOperator.generalizeExecute(padded, 0.02, { removeDegenerateParts: true })) ?? padded;
  return {
    rings: general.rings.map((ring) => ring.map(([x, y]) => [Math.round(x! * 1e3) / 1e3, Math.round(y! * 1e3) / 1e3])),
  };
}

export function footprintToJSON(footprint: SmokeFootprint): { level: ExposureLevel; geometry: EsriPolygonJSON }[] {
  return [...footprint.byLevel.entries()].map(([level, poly]) => ({ level, geometry: { rings: poly.rings } }));
}

/** Pure geodesic helpers and a grid index for fast radius queries on lon/lat points. */

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface Located {
  lon: number;
  lat: number;
}

/**
 * Uniform lon/lat grid. Cell size is in degrees; radius queries scan the
 * cells covering the query circle's bounding box and filter by true distance.
 */
export class GridIndex<T extends Located> {
  private readonly cells = new Map<string, T[]>();
  readonly size: number;

  constructor(
    items: readonly T[],
    private readonly cellDeg = 0.5,
  ) {
    for (const item of items) {
      const key = this.key(this.cell(item.lon), this.cell(item.lat));
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(item);
    }
    this.size = items.length;
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellDeg);
  }

  private key(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  /** Visits items within `radiusKm`, passing each item's distance. */
  forEachWithin(lon: number, lat: number, radiusKm: number, visit: (item: T, distanceKm: number) => void): void {
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.max(Math.cos(toRad(lat)), 0.01));
    const x0 = this.cell(lon - dLon);
    const x1 = this.cell(lon + dLon);
    const y0 = this.cell(lat - dLat);
    const y1 = this.cell(lat + dLat);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const item of bucket) {
          const d = haversineKm(lon, lat, item.lon, item.lat);
          if (d <= radiusKm) visit(item, d);
        }
      }
    }
  }

  countWithin(lon: number, lat: number, radiusKm: number): number {
    let n = 0;
    this.forEachWithin(lon, lat, radiusKm, () => n++);
    return n;
  }

  nearest(lon: number, lat: number, maxKm: number): { item: T; distanceKm: number } | null {
    let best: { item: T; distanceKm: number } | null = null;
    this.forEachWithin(lon, lat, maxKm, (item, d) => {
      if (!best || d < best.distanceKm) best = { item, distanceKm: d };
    });
    return best;
  }
}

/** Inverse-distance-weighted mean (power 2) of values within `radiusKm`. */
export function idw<T extends Located>(
  index: GridIndex<T>,
  lon: number,
  lat: number,
  radiusKm: number,
  value: (item: T) => number | null,
): number | null {
  let wSum = 0;
  let vSum = 0;
  // Monitors closer than 0.5 km are treated as co-located (weight capped at d = 0.5 km).
  index.forEachWithin(lon, lat, radiusKm, (item, d) => {
    const v = value(item);
    if (v === null) return;
    const w = 1 / Math.max(d, 0.5) ** 2;
    wSum += w;
    vSum += w * v;
  });
  return wSum > 0 ? vSum / wSum : null;
}

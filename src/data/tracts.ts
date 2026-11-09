import { SERVICES, TRACT_FIELDS } from "../config/services";
import type { EsriPolygonJSON, Tract } from "../types/domain";
import { queryAll } from "./arcgisRest";
import { normalizeTract } from "./normalize";

const OUT_FIELDS = [
  TRACT_FIELDS.id,
  TRACT_FIELDS.name,
  TRACT_FIELDS.state,
  TRACT_FIELDS.county,
  TRACT_FIELDS.landArea,
  TRACT_FIELDS.population,
  TRACT_FIELDS.children,
  TRACT_FIELDS.seniors,
];

/** Upper bound on tracts per analysis (the U.S. has ~85,000). */
export const MAX_TRACTS = 90000;

/** Tracts whose polygons intersect the smoke footprint, with centroids. */
export async function fetchTractsInFootprint(
  footprint: EsriPolygonJSON,
  signal?: AbortSignal,
): Promise<{ tracts: Tract[]; truncated: boolean }> {
  const { features, truncated } = await queryAll(SERVICES.tracts.url, {
    where: SERVICES.tracts.where,
    outFields: OUT_FIELDS,
    returnGeometry: false,
    returnCentroid: true,
    geometry: footprint,
    pageSize: 16000,
    parallel: 4,
    orderByFields: "OBJECTID",
    limit: MAX_TRACTS,
    signal,
  });
  const tracts = features.map((f) => normalizeTract(f.attributes, f.centroid)).filter((t): t is Tract => t !== null);
  return { tracts, truncated };
}

export async function fetchTract(geoid: string, signal?: AbortSignal): Promise<Tract | null> {
  if (!/^\d{11}$/.test(geoid)) return null;
  const { features } = await queryAll(SERVICES.tracts.url, {
    where: `${TRACT_FIELDS.id} = '${geoid}'`,
    outFields: OUT_FIELDS,
    returnGeometry: false,
    returnCentroid: true,
    pageSize: 1,
    limit: 1,
    signal,
  });
  const f = features[0];
  return f ? normalizeTract(f.attributes, f.centroid) : null;
}

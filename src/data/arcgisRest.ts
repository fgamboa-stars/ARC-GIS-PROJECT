import esriRequest from "@arcgis/core/request";
import type { Attributes } from "../types/domain";

/**
 * Thin client for ArcGIS feature-service `query` operations.
 *
 * The SDK's `FeatureLayer.queryFeatures` is page-limited by each service's
 * `maxRecordCount` (only 50 for ACS tracts). Querying REST directly lets us
 * request `resultType=standard`, which raises the page size to
 * `standardMaxRecordCount` (up to 32,000 without geometry), POST large
 * spatial filters, and fetch pages in parallel.
 */

export interface QueryParams {
  where?: string;
  outFields?: readonly string[];
  returnGeometry?: boolean;
  returnCentroid?: boolean;
  geometry?: object;
  geometryType?: "esriGeometryPolygon" | "esriGeometryEnvelope" | "esriGeometryPoint";
  maxAllowableOffset?: number;
  geometryPrecision?: number;
  /** Stable ordering, required for consistent parallel paging. */
  orderByFields?: string;
  pageSize?: number;
  /** Number of pages to request concurrently (requires a count query first). */
  parallel?: number;
  /** Stop after this many features. */
  limit?: number;
  signal?: AbortSignal;
}

export interface QueryFeature {
  attributes: Attributes;
  geometry?: Record<string, unknown> | null;
  centroid?: { x: number; y: number } | null;
}

interface QueryResponse {
  features?: QueryFeature[];
  count?: number;
  exceededTransferLimit?: boolean;
  error?: { message?: string };
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

const WGS84 = JSON.stringify({ wkid: 4326 });

type QueryString = Record<string, string | number | boolean>;

function baseQuery(params: QueryParams): QueryString {
  const q: QueryString = { f: "json", where: params.where ?? "1=1" };
  if (params.geometry) {
    q.geometry = JSON.stringify(params.geometry);
    q.geometryType = params.geometryType ?? "esriGeometryPolygon";
    q.spatialRel = "esriSpatialRelIntersects";
    q.inSR = WGS84;
  }
  return q;
}

async function post(url: string, query: QueryString, signal?: AbortSignal): Promise<QueryResponse> {
  let data: QueryResponse;
  try {
    const response = await esriRequest(`${url}/query`, { query, method: "post", responseType: "json", signal });
    data = response.data as QueryResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ServiceError(err instanceof Error ? err.message : "Request failed", url);
  }
  if (data.error) throw new ServiceError(data.error.message ?? "Query failed", url);
  return data;
}

export async function queryCount(url: string, params: QueryParams): Promise<number> {
  const data = await post(url, { ...baseQuery(params), returnCountOnly: true }, params.signal);
  return data.count ?? 0;
}

export async function queryAll(
  url: string,
  params: QueryParams,
): Promise<{ features: QueryFeature[]; truncated: boolean }> {
  const pageSize = params.pageSize ?? 2000;
  const limit = params.limit ?? Number.POSITIVE_INFINITY;
  const pageQuery = (offset: number): QueryString => {
    const q: QueryString = {
      ...baseQuery(params),
      outFields: (params.outFields ?? ["*"]).join(","),
      returnGeometry: params.returnGeometry ?? true,
      outSR: WGS84,
      resultType: "standard",
      resultOffset: offset,
      resultRecordCount: pageSize,
    };
    if (params.orderByFields) q.orderByFields = params.orderByFields;
    if (params.returnCentroid) q.returnCentroid = true;
    if (params.maxAllowableOffset !== undefined) q.maxAllowableOffset = params.maxAllowableOffset;
    if (params.geometryPrecision !== undefined) q.geometryPrecision = params.geometryPrecision;
    return q;
  };

  if (params.parallel && params.parallel > 1) {
    const count = Math.min(await queryCount(url, params), limit);
    const offsets = Array.from({ length: Math.ceil(count / pageSize) }, (_, i) => i * pageSize);
    const pages: QueryFeature[][] = new Array<QueryFeature[]>(offsets.length);
    let next = 0;
    const worker = async () => {
      while (next < offsets.length) {
        const i = next++;
        pages[i] = (await post(url, pageQuery(offsets[i]!), params.signal)).features ?? [];
      }
    };
    await Promise.all(Array.from({ length: Math.min(params.parallel, offsets.length) }, worker));
    const features = pages.flat();
    return { features: features.slice(0, limit), truncated: features.length > limit || count >= limit };
  }

  const features: QueryFeature[] = [];
  for (let offset = 0; ;) {
    const data = await post(url, pageQuery(offset), params.signal);
    const page = data.features ?? [];
    features.push(...page);
    if (features.length >= limit) return { features: features.slice(0, limit), truncated: true };
    if (!data.exceededTransferLimit || page.length === 0) return { features, truncated: false };
    offset += page.length;
  }
}

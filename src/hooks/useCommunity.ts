import { type AnalysisRun, assessTract } from "../analysis/pipeline";
import { fetchTract } from "../data/tracts";
import type { FireIncident, TractAssessment } from "../types/domain";
import { useAsync } from "./useAsync";

export interface CommunityDetail {
  assessment: TractAssessment;
  nearbyFires: { fire: FireIncident; distanceKm: number }[];
  inSmoke: boolean;
}

/**
 * Detail for the selected tract. Exposed tracts come straight from the
 * analysis; any other tract is fetched and scored on demand with the same
 * footprint and risk context.
 */
export function useCommunity(geoid: string | null, run: AnalysisRun | null) {
  return useAsync<CommunityDetail | null>(
    geoid && run
      ? async (signal) => {
          let assessment = run.result.assessments.find((a) => a.tract.geoid === geoid);
          if (!assessment) {
            const tract = await fetchTract(geoid, signal);
            if (!tract) return null;
            assessment = assessTract(tract, run.footprint, run.context);
          }
          const nearbyFires: CommunityDetail["nearbyFires"] = [];
          run.context.fires.forEachWithin(assessment.tract.lon, assessment.tract.lat, 250, (fire, distanceKm) => {
            nearbyFires.push({ fire, distanceKm });
          });
          nearbyFires.sort((a, b) => a.distanceKm - b.distanceKm);
          return { assessment, nearbyFires: nearbyFires.slice(0, 5), inSmoke: assessment.factors.smokeLevel >= 2 };
        }
      : null,
    [geoid, run],
  );
}

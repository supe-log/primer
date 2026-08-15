import type {
  CompilationRequest,
  CoursePlan,
  CurriculumGraph,
  QuestionItem,
  RefusalReport,
} from "@contracts";
import type { JurisdictionAdapter } from "../adapters/jurisdiction";
import type { SourceManifest } from "@contracts";
import { mapCurriculumFallback } from "./fallbackMap";
import { auditGraphWithRepair, type GraphRevision } from "./graphAuditor";
import { planSequence } from "./sequencePlanner";
import { writeFallbackItems } from "./fallbackItems";

/**
 * Deterministic construction path. Used when the model client abstains, which is
 * the default with no key and the stage fallback if a live call fails.
 *
 * Order is fixed: map → audit (two-pass repair) → sequence → items. If the
 * auditor abstains, nothing is sequenced.
 */

export interface FallbackBundle {
  graph?: CurriculumGraph;
  coursePlan?: CoursePlan;
  items: QuestionItem[];
  revisions: GraphRevision[];
  refusal?: RefusalReport;
}

export function buildFallbackBundle(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  sourceManifest: SourceManifest;
}): FallbackBundle {
  const mapped = mapCurriculumFallback(input);
  const audited = auditGraphWithRepair(mapped);
  if (audited.abstained || !audited.graph) {
    return { items: [], revisions: audited.revisions, refusal: audited.refusal };
  }

  const coursePlan = planSequence({
    graph: audited.graph,
    request: input.request,
    sourceManifest: input.sourceManifest,
  });
  const items = writeFallbackItems({
    graph: audited.graph,
    request: input.request,
    coursePlan,
  });

  return {
    graph: audited.graph,
    coursePlan,
    items,
    revisions: audited.revisions,
  };
}

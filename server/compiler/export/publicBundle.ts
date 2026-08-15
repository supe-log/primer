import type {
  CompilationResult,
  CompilationStatus,
  CoursePlan,
  GateReport,
  QuestionItem,
  SourceManifest,
} from "@contracts";
import {
  exportLeaksCiteOnlyBody,
  exportSourceCitations,
  mayRedistributeSource,
  stripCiteOnlyBodies,
  type PublicSourceCitation,
} from "../licence/gate";

/**
 * Public export presentation. This is what may leave the box.
 *
 * The compile result can still carry short quoted spans for internal span matching.
 * The export is a different artifact: citations, links and attribution for every
 * source, quoted text only when redistribution is permitted, and a last-pass strip
 * of any cite-only snapshot body that leaked into lesson or item prose.
 *
 * Not a shared contract. The client may render this payload, but schemaVersion
 * here is informational and does not bump `shared/contracts`.
 */

export interface PublicExportOptions {
  /**
   * Verbatim snapshot bodies keyed by sourceId. Only cite-only / unknown sources
   * are stripped. Redistributable bodies may be quoted.
   */
  protectedBodies?: Record<string, string>;
}

export interface PublicAlignment {
  requestedStandardIds: string[];
  mappedStandardIds: string[];
  assessedStandardIds: string[];
  coverageOk: boolean;
}

export interface PublicLesson {
  lessonId: string;
  title: string;
  objective: string;
  introducesKnowledgeComponentIds: string[];
  reviewsKnowledgeComponentIds: string[];
}

export interface PublicItem {
  itemId: string;
  stem: string;
  standardIds: string[];
  knowledgeComponentIds: string[];
  correctOptionId: string;
  rejected: boolean;
  rejectionReason?: string;
}

export interface PublicExportBundle {
  schemaVersion: "0.1.0";
  runId: string;
  status: CompilationStatus;
  citations: PublicSourceCitation[];
  alignment: PublicAlignment;
  course?: {
    title: string;
    lessons: PublicLesson[];
  };
  items: PublicItem[];
  gate: Pick<GateReport, "verdict" | "permission" | "summary" | "missingEvidence" | "unmeasured">;
  refusal?: CompilationResult["refusal"];
  licence: {
    redistributableSourceIds: string[];
    citeOnlySourceIds: string[];
    strippedSourceIds: string[];
  };
}

export function citeOnlyBodies(
  manifest: SourceManifest,
  bodiesBySourceId: Record<string, string> = {},
): Record<string, string> {
  const protectedBodies: Record<string, string> = {};
  for (const source of manifest.sources) {
    const body = bodiesBySourceId[source.sourceId];
    if (!body || mayRedistributeSource(source)) continue;
    protectedBodies[source.sourceId] = body;
  }
  return protectedBodies;
}

function presentCourse(plan: CoursePlan): PublicExportBundle["course"] {
  return {
    title: plan.title,
    lessons: plan.lessons.map((lesson) => ({
      lessonId: lesson.lessonId,
      title: lesson.title,
      objective: lesson.objective,
      introducesKnowledgeComponentIds: lesson.introducesKnowledgeComponentIds,
      reviewsKnowledgeComponentIds: lesson.reviewsKnowledgeComponentIds,
    })),
  };
}

function presentItems(items: QuestionItem[]): PublicItem[] {
  return items.map((item) => ({
    itemId: item.itemId,
    stem: item.stem,
    standardIds: item.standardIds,
    knowledgeComponentIds: item.knowledgeComponentIds,
    correctOptionId: item.correctOptionId,
    rejected: Boolean(item.rejection),
    rejectionReason: item.rejection?.reason,
  }));
}

function alignmentFrom(result: CompilationResult): PublicAlignment {
  const requested = result.request.standardIds;
  const mapped = new Set(result.graph?.knowledgeComponents.flatMap((kc) => kc.standardIds) ?? []);
  const assessed = new Set(result.items.flatMap((item) => item.standardIds));
  const mappedStandardIds = requested.filter((id) => mapped.has(id));
  const assessedStandardIds = requested.filter((id) => assessed.has(id));
  return {
    requestedStandardIds: requested,
    mappedStandardIds,
    assessedStandardIds,
    coverageOk:
      result.status !== "refused" &&
      mappedStandardIds.length === requested.length &&
      assessedStandardIds.length === requested.length,
  };
}

/**
 * Build the cite-only-safe export of a compile result. Always includes the
 * citation list, even on a refused run, because observing is always allowed.
 */
export function buildPublicExport(
  result: CompilationResult,
  options: PublicExportOptions = {},
): PublicExportBundle {
  const protectedBodies = citeOnlyBodies(result.sourceManifest, options.protectedBodies ?? {});
  const citations = exportSourceCitations(result.sourceManifest, options.protectedBodies ?? {});
  const draft: PublicExportBundle = {
    schemaVersion: "0.1.0",
    runId: result.runId,
    status: result.status,
    citations,
    alignment: alignmentFrom(result),
    course: result.coursePlan ? presentCourse(result.coursePlan) : undefined,
    items: presentItems(result.items),
    gate: {
      verdict: result.gateReport.verdict,
      permission: result.gateReport.permission,
      summary: result.gateReport.summary,
      missingEvidence: result.gateReport.missingEvidence,
      unmeasured: result.gateReport.unmeasured,
    },
    refusal: result.refusal,
    licence: {
      redistributableSourceIds: result.sourceManifest.sources
        .filter(mayRedistributeSource)
        .map((source) => source.sourceId),
      citeOnlySourceIds: result.sourceManifest.sources
        .filter((source) => !mayRedistributeSource(source))
        .map((source) => source.sourceId),
      strippedSourceIds: [],
    },
  };

  const stripped = stripCiteOnlyBodies(draft, protectedBodies) as PublicExportBundle;
  stripped.licence.strippedSourceIds = exportLeaksCiteOnlyBody(draft, protectedBodies);
  return stripped;
}

export function publicExportLeaks(exported: PublicExportBundle, protectedBodies: Record<string, string>): string[] {
  return exportLeaksCiteOnlyBody(exported, protectedBodies);
}

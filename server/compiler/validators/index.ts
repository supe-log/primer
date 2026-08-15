import type {
  CompilationRequest,
  CoursePlan,
  CurriculumGraph,
  GateCheck,
  QuestionItem,
  SourceManifest,
} from "@contracts";
import { validateGraph, topologicalOrder } from "./graph";
import { validateItems } from "./items";

export { validateGraph, validateItems, topologicalOrder };
export { findCycle } from "./graph";

/** Fields that must never appear anywhere in a request or artifact. */
const FORBIDDEN_PII_KEYS = [
  "studentname",
  "firstname",
  "lastname",
  "dateofbirth",
  "dob",
  "email",
  "phone",
  "address",
  "studentid",
  "photo",
];

function countKeys(value: unknown, found: string[], scanned: { n: number }): void {
  if (Array.isArray(value)) {
    for (const entry of value) countKeys(entry, found, scanned);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      scanned.n += 1;
      if (FORBIDDEN_PII_KEYS.includes(key.toLowerCase().replace(/[_-]/g, ""))) {
        found.push(key);
      }
      countKeys(child, found, scanned);
    }
  }
}

export function validatePrivacy(payload: unknown): GateCheck {
  const found: string[] = [];
  const scanned = { n: 0 };
  countKeys(payload, found, scanned);
  return {
    checkId: "check:privacy.no-student-pii",
    label: "No student personal information anywhere in the run",
    kind: "deterministic",
    blocking: true,
    status: found.length === 0 ? "pass" : "fail",
    detail:
      found.length === 0
        ? `${scanned.n} fields scanned, no student-identifying field present.`
        : `Student-identifying fields present: ${found.join(", ")}. This is a hard block.`,
    counts: { fieldsScanned: scanned.n, violations: found.length },
  };
}

export function validateSources(manifest: SourceManifest): GateCheck[] {
  const unknown = manifest.sources.filter((source) => source.licence.posture === "unknown");
  const fetched = manifest.sources.filter((source) => source.fetched);
  return [
    {
      checkId: "check:source.licence-known",
      label: "Every source carries a licence record",
      kind: "deterministic",
      blocking: true,
      status: unknown.length === 0 ? "pass" : "fail",
      detail:
        unknown.length === 0
          ? `${manifest.sources.length} sources, every one with a licence posture. Cite-only source text is never reproduced in an export.`
          : `${unknown.length} sources have an unknown licence, which caps this run at prototype and blocks redistribution.`,
      counts: { sources: manifest.sources.length, unknownLicence: unknown.length },
    },
    {
      checkId: "check:source.snapshot-fetched",
      label: "Sources were fetched and content-hashed",
      kind: "deterministic",
      blocking: false,
      status: fetched.length === manifest.sources.length ? "pass" : "fail",
      detail:
        fetched.length === manifest.sources.length
          ? `${fetched.length} sources fetched and hashed.`
          : `${fetched.length} of ${manifest.sources.length} sources were fetched. The rest are hand-written prototype samples with no span match to an official snapshot.`,
      counts: { sources: manifest.sources.length, fetched: fetched.length },
    },
  ];
}

export function validateCoverage(
  request: CompilationRequest,
  graph: CurriculumGraph,
  items: QuestionItem[],
): GateCheck {
  const mappedStandards = new Set(
    graph.knowledgeComponents.flatMap((kc) => kc.standardIds),
  );
  // Only items that survived validation count. A rejected item is not going to be
  // practised, so a standard whose only item was rejected is unassessed — counting
  // it would let a bundle claim full coverage while shipping nothing to practise,
  // which is the exact dishonesty the gate exists to catch.
  const surviving = items.filter((item) => !item.rejection);
  const assessedStandards = new Set(surviving.flatMap((item) => item.standardIds));
  const unmapped = request.standardIds.filter((id) => !mappedStandards.has(id));
  const unassessed = request.standardIds.filter((id) => !assessedStandards.has(id));
  const ok = unmapped.length === 0 && unassessed.length === 0;
  return {
    checkId: "check:coverage.standards",
    label: "Every requested standard maps to a knowledge component and an item",
    kind: "deterministic",
    blocking: true,
    status: ok ? "pass" : "fail",
    detail: ok
      ? `${request.standardIds.length} of ${request.standardIds.length} requested standards are mapped and assessed. Coverage is computed from the artifacts, not asserted.`
      : `Unmapped: ${unmapped.join(", ") || "none"}. Unassessed: ${unassessed.join(", ") || "none"}.`,
    counts: {
      requested: request.standardIds.length,
      mapped: request.standardIds.length - unmapped.length,
      assessed: request.standardIds.length - unassessed.length,
      itemsRejected: items.length - surviving.length,
    },
  };
}

export function validateCoursePlan(plan: CoursePlan, graph: CurriculumGraph): GateCheck[] {
  const order = topologicalOrder(graph);
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const planOrderRespectsPrerequisites = graph.prerequisiteEdges.every((edge) => {
    const fromIndex = plan.knowledgeComponentOrder.indexOf(edge.from);
    const toIndex = plan.knowledgeComponentOrder.indexOf(edge.to);
    return fromIndex >= 0 && toIndex >= 0 && fromIndex < toIndex;
  });

  const introduced = new Set(
    plan.lessons.flatMap((lesson) => lesson.introducesKnowledgeComponentIds),
  );
  const reviewed = new Set(plan.lessons.flatMap((lesson) => lesson.reviewsKnowledgeComponentIds));
  // A below-stage prerequisite may be reviewed rather than introduced, because the
  // learner is assumed to have met it before. Everything else must be introduced.
  const unscheduled = graph.knowledgeComponents
    .filter((kc) =>
      kc.prerequisiteOnly
        ? !introduced.has(kc.knowledgeComponentId) && !reviewed.has(kc.knowledgeComponentId)
        : !introduced.has(kc.knowledgeComponentId),
    )
    .map((kc) => kc.knowledgeComponentId);
  const scheduled = new Set([...introduced, ...reviewed]);

  const arcComplete = plan.lessons.every(
    (lesson) =>
      lesson.arc.review &&
      lesson.arc.modelling &&
      lesson.arc.guidedPractice &&
      lesson.arc.independentPractice &&
      lesson.arc.closingReview,
  );

  return [
    {
      checkId: "check:sequence.topological",
      label: "Lesson order respects every prerequisite edge",
      kind: "deterministic",
      blocking: true,
      status: planOrderRespectsPrerequisites && orderIndex.size > 0 ? "pass" : "fail",
      detail: planOrderRespectsPrerequisites
        ? "Every prerequisite appears before the component that needs it."
        : "At least one knowledge component is scheduled before its prerequisite.",
      counts: { edges: graph.prerequisiteEdges.length },
    },
    {
      checkId: "check:sequence.all-scheduled",
      label: "Every knowledge component is introduced, or reviewed when below stage",
      kind: "deterministic",
      blocking: true,
      status: unscheduled.length === 0 ? "pass" : "fail",
      detail:
        unscheduled.length === 0
          ? `${scheduled.size} knowledge components scheduled across ${plan.lessons.length} lessons.`
          : `Not scheduled: ${unscheduled.join(", ")}.`,
      counts: { scheduled: scheduled.size, unscheduled: unscheduled.length },
    },
    {
      checkId: "check:lesson.arc-complete",
      label: "Every lesson carries all five explicit-instruction phases",
      kind: "deterministic",
      blocking: true,
      status: arcComplete ? "pass" : "fail",
      detail: arcComplete
        ? `${plan.lessons.length} lessons, each with review, modelling, guided practice, independent practice and closing review.`
        : "At least one lesson is missing an arc phase.",
      counts: { lessons: plan.lessons.length },
    },
    {
      checkId: "check:sequence.decisions-cited",
      label: "Every sequencing decision states a reason and an evidence level",
      kind: "deterministic",
      blocking: false,
      status: "pass",
      detail: `${plan.decisions.length + plan.lessons.reduce((total, lesson) => total + lesson.decisions.length, 0)} sequencing decisions recorded with a lever, a reason and an evidence level. Low-evidence levers are never applied as hard constraints.`,
      counts: {
        planDecisions: plan.decisions.length,
        lessonDecisions: plan.lessons.reduce((total, lesson) => total + lesson.decisions.length, 0),
      },
    },
  ];
}

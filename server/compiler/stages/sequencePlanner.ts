import type {
  CompilationRequest,
  CoursePlan,
  CurriculumGraph,
  KnowledgeComponent,
  Lesson,
  SequencingDecision,
  SourceManifest,
} from "@contracts";
import { topologicalOrder } from "../validators/graph";

/**
 * Sequence planner. Arithmetic over the graph, not a model judgement.
 *
 * Lesson order is a topological order of the prerequisite graph, packed into the
 * requested lesson count. Every decision names a lever, a reason and an evidence
 * level so a weak rule is never applied as a hard constraint.
 */

function slugFromId(id: string): string {
  return id.replace(/^kc:[a-z0-9]+\./, "").replace(/[^a-z0-9]+/g, "-");
}

function cite(
  manifest: SourceManifest | undefined,
  sourceId: string,
  quotedSpan: string,
): SequencingDecision["evidence"] {
  if (!manifest?.sources.some((source) => source.sourceId === sourceId)) return [];
  return [{ sourceId, quotedSpan, retrievalLanguage: "en" }];
}

function chunk<T>(items: T[], bucketCount: number): T[][] {
  if (items.length === 0) return [[]];
  const buckets = Math.max(1, Math.min(bucketCount, items.length));
  const base = Math.floor(items.length / buckets);
  const extra = items.length % buckets;
  const out: T[][] = [];
  let offset = 0;
  for (let index = 0; index < buckets; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    out.push(items.slice(offset, offset + size));
    offset += size;
  }
  return out;
}

function lessonArc(introduced: KnowledgeComponent[], reviewed: KnowledgeComponent[]): Lesson["arc"] {
  const intro = introduced.map((kc) => kc.label).join("; ") || "the scheduled component";
  const review = reviewed.map((kc) => kc.label).join("; ") || "prior knowledge";
  return {
    review: `Low-stakes retrieval on ${review}, because retrieval opens every lesson.`,
    modelling: `Teacher models ${intro}, saying the units and the comparison aloud.`,
    guidedPractice: `Guided items on ${intro}, aiming for about four in five correct before release.`,
    independentPractice: `Interleaved practice mixing ${intro} with ${review} so the learner chooses the move.`,
    closingReview: `One retrieval prompt from today and one from ${review}.`,
  };
}

export function planSequence(input: {
  graph: CurriculumGraph;
  request: CompilationRequest;
  sourceManifest?: SourceManifest;
}): CoursePlan {
  const { graph, request, sourceManifest } = input;
  const order = topologicalOrder(graph);
  if (order.length === 0) {
    throw new Error("planSequence requires an acyclic graph; the auditor must run first");
  }

  const byId = new Map(graph.knowledgeComponents.map((kc) => [kc.knowledgeComponentId, kc]));
  const ordered = order.map((id) => byId.get(id)!);
  const introduce = ordered.filter((kc) => !kc.prerequisiteOnly);
  const reviewOnly = ordered.filter((kc) => kc.prerequisiteOnly);
  const groups = chunk(introduce, request.lessonCount);

  const unitId = `unit:${request.jurisdictionId}.${request.subject.toLowerCase().replace(/\s+/g, "-")}.compiled`;
  const lessons: Lesson[] = groups.map((group, index) => {
    const previous = groups.slice(0, index).flat();
    const reviewed = index === 0 ? reviewOnly : [...reviewOnly.slice(0, 1), ...previous.slice(-2)];
    const uniqueReviewed = reviewed.filter(
      (kc, reviewIndex, list) =>
        list.findIndex((entry) => entry.knowledgeComponentId === kc.knowledgeComponentId) ===
          reviewIndex &&
        !group.some((intro) => intro.knowledgeComponentId === kc.knowledgeComponentId),
    );
    const lead = group[0] ?? reviewOnly[0] ?? ordered[0]!;
    const lessonId = `lesson:${request.jurisdictionId}.${String(index + 1).padStart(2, "0")}-${slugFromId(lead.knowledgeComponentId)}`;

    const decisions: SequencingDecision[] = [
      {
        lever: "explicit_instruction_arc",
        reason:
          "Guided practice targets about four in five correct before independent work. That figure is a convention from a master-teacher review, not a hard constraint.",
        evidenceLevel: "convention",
        evidence: cite(sourceManifest, "src:rosenshine.principles", "appears to be about 80 percent"),
      },
      {
        lever: "retrieval_practice",
        reason: "Every lesson opens and closes with low-stakes retrieval rather than re-reading.",
        evidenceLevel: "strong",
        evidence: cite(
          sourceManifest,
          "src:ies.organizing-instruction",
          "Use quizzes to re-expose students to key content",
        ),
      },
    ];
    if (index > 0) {
      decisions.push({
        lever: "spacing",
        reason:
          "Previously introduced components are re-exposed in a later lesson, with the interval widening toward the goal date.",
        evidenceLevel: "moderate",
        evidence: cite(sourceManifest, "src:ies.organizing-instruction", "Space learning over time"),
      });
      decisions.push({
        lever: "interleaving",
        reason:
          "Independent practice mixes today's component with an earlier one rather than blocking by type.",
        evidenceLevel: "moderate",
        evidence: cite(sourceManifest, "src:ies.interleaving-rct", "interleaved mathematics practice"),
      });
    }

    return {
      lessonId,
      unitId,
      title: group.map((kc) => kc.label).join(" and ") || `Lesson ${index + 1}`,
      objective: `Learners can ${lead.description.charAt(0).toLowerCase()}${lead.description.slice(1)}`,
      introducesKnowledgeComponentIds:
        group.length > 0
          ? group.map((kc) => kc.knowledgeComponentId)
          : [lead.knowledgeComponentId],
      reviewsKnowledgeComponentIds: uniqueReviewed.map((kc) => kc.knowledgeComponentId),
      arc: lessonArc(group.length > 0 ? group : [lead], uniqueReviewed),
      guidedPracticeSuccessTarget: 0.8,
      // Left empty here on purpose. A worked example has to share the shape of the
      // practice, and items do not exist yet at sequencing time. attachWorkedExamples
      // fills these in once they do, from the items' own numbers, and leaves a lesson
      // with none when nothing derivable is there. The four generic sentences that
      // used to sit here were identical for every component in every course.
      workedExamples: [],
      retrievalPrompts: [
        `Without looking back, state ${lead.label} in one sentence.`,
        `Name the error a learner makes when they confuse ${lead.label} with a nearby idea.`,
      ],
      deepExplanatoryQuestions: [`Why does ${lead.label} have to hold before the next component?`],
      itemIds: [],
      decisions,
    };
  });

  return {
    schemaVersion: "0.1.0",
    title: `${request.subject}: ${request.goal}`,
    knowledgeComponentOrder: order,
    units: [
      {
        unitId,
        title: `${request.stage.localLabel} ${request.subject}`,
        goal: request.goal,
        lessonIds: lessons.map((lesson) => lesson.lessonId),
      },
    ],
    lessons,
    masteryCriteria: introduce.map((kc) => ({
      knowledgeComponentId: kc.knowledgeComponentId,
      rule: `Four of five items correct on ${kc.label} across two separate days.`,
    })),
    decisions: [
      {
        lever: "prerequisite_order",
        reason:
          "Lesson order is a topological order of the prerequisite graph, tie-broken by the source's own component order.",
        evidenceLevel: "convention",
        evidence: [],
      },
      {
        lever: "mastery_threshold",
        reason:
          "Mastery rules are stated operationally per knowledge component. No effect size is claimed for the thresholds themselves.",
        evidenceLevel: "convention",
        evidence: [],
      },
      {
        lever: "worked_example_fading",
        reason:
          "Each worked example shows the first steps fully and leaves later steps to the learner.",
        evidenceLevel: "moderate",
        evidence: cite(
          sourceManifest,
          "src:ies.organizing-instruction",
          "Interleave worked example solutions with problem-solving exercises",
        ),
      },
    ],
  };
}

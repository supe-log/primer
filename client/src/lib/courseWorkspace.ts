import type {
  CompilationResult,
  KnowledgeComponent,
  Lesson,
  QuestionItem,
  StandardNode,
  WorkedExample,
} from "@contracts";

export interface CourseItemView {
  item: QuestionItem;
  standardCodes: string[];
  componentLabels: string[];
}

export interface CourseLessonView {
  lesson: Lesson;
  index: number;
  items: CourseItemView[];
  components: KnowledgeComponent[];
}

export interface CourseWorkspace {
  title: string;
  stage: string;
  subject: string;
  lessons: CourseLessonView[];
  shippedCount: number;
  rejectedCount: number;
}

export type LessonBeat =
  | { kind: "warmup"; title: string; coach: string; prompts: string[] }
  | { kind: "model"; title: string; coach: string; example?: WorkedExample }
  | { kind: "guided"; title: string; coach: string; item: CourseItemView }
  | { kind: "practice"; title: string; coach: string; item: CourseItemView; remaining: number }
  | { kind: "wrap"; title: string; coach: string; prompts: string[] };

export const BEAT_LABEL: Record<LessonBeat["kind"], string> = {
  warmup: "Warm up",
  model: "See an example",
  guided: "Try together",
  practice: "Your turn",
  wrap: "Finish",
};

export function canOpenCourse(result: CompilationResult | null | undefined): boolean {
  return Boolean(
    result &&
      result.status !== "refused" &&
      result.coursePlan &&
      result.graph &&
      result.coursePlan.lessons.length > 0,
  );
}

export function buildCourseWorkspace(result: CompilationResult): CourseWorkspace | null {
  if (!canOpenCourse(result) || !result.coursePlan || !result.graph) {
    return null;
  }

  const components = new Map(
    result.graph.knowledgeComponents.map((component) => [
      component.knowledgeComponentId,
      component,
    ]),
  );
  const standards = new Map(
    result.graph.standards.map((standard) => [standard.standardId, standard]),
  );
  const itemsById = new Map(result.items.map((item) => [item.itemId, item]));
  const shipped = result.items.filter((item) => !item.rejection);

  const lessons = result.coursePlan.lessons.map((lesson, index) => {
    const introduced = lesson.introducesKnowledgeComponentIds
      .map((id) => components.get(id))
      .filter((component): component is KnowledgeComponent => Boolean(component));

    const fromIds = lesson.itemIds
      .map((id) => itemsById.get(id))
      .filter((item): item is QuestionItem => item !== undefined && !item.rejection);

    const fromComponents =
      fromIds.length > 0
        ? []
        : shipped.filter((item) =>
            item.knowledgeComponentIds.some((id) =>
              lesson.introducesKnowledgeComponentIds.includes(id),
            ),
          );

    const items = (fromIds.length > 0 ? fromIds : fromComponents).map((item) =>
      toItemView(item, standards, components),
    );

    return { lesson, index, items, components: introduced };
  });

  return {
    title: result.coursePlan.title,
    stage: result.request.stage.localLabel,
    subject: result.request.subject,
    lessons,
    shippedCount: shipped.length,
    rejectedCount: result.items.length - shipped.length,
  };
}

export function gradeOption(
  item: QuestionItem,
  optionId: string,
): {
  correct: boolean;
  selectedId: string;
  keyId: string;
  selectedRationale: string;
  keyRationale: string;
  misconceptionId?: string;
} {
  const selected = item.options.find((option) => option.optionId === optionId);
  const key = item.options.find((option) => option.optionId === item.correctOptionId);
  return {
    correct: optionId === item.correctOptionId,
    selectedId: optionId,
    keyId: item.correctOptionId,
    selectedRationale: selected?.rationale ?? "",
    keyRationale: item.keyRationale || key?.rationale || "",
    misconceptionId: selected?.correct ? undefined : selected?.misconceptionId,
  };
}

export function friendlyLessonTitle(lesson: CourseLessonView): string {
  return lesson.components[0]?.label ?? lesson.lesson.title.split(" and ")[0] ?? lesson.lesson.title;
}

/**
 * One-screen-at-a-time path for a lesson. Order is the explicit-instruction
 * arc: retrieve, model, guided item, independent items, close. Empty beats
 * are dropped rather than filled with invented content.
 */
export function lessonBeats(lesson: CourseLessonView): LessonBeat[] {
  const beats: LessonBeat[] = [];
  const prompts = lesson.lesson.retrievalPrompts;
  if (prompts.length > 0 || lesson.lesson.arc.review) {
    beats.push({
      kind: "warmup",
      title: "Warm up",
      coach: lesson.lesson.arc.review,
      prompts,
    });
  }

  const example = lesson.lesson.workedExamples[0];
  if (example || lesson.lesson.arc.modelling) {
    beats.push({
      kind: "model",
      title: "See an example",
      coach: lesson.lesson.arc.modelling,
      example,
    });
  }

  const [guided, ...independent] = lesson.items;
  if (guided) {
    beats.push({
      kind: "guided",
      title: "Try together",
      coach: lesson.lesson.arc.guidedPractice,
      item: guided,
    });
  }
  independent.forEach((item, index) => {
    beats.push({
      kind: "practice",
      title: "Your turn",
      coach: lesson.lesson.arc.independentPractice,
      item,
      remaining: independent.length - index - 1,
    });
  });

  beats.push({
    kind: "wrap",
    title: "Finish",
    coach: lesson.lesson.arc.closingReview,
    prompts: lesson.lesson.deepExplanatoryQuestions,
  });

  return beats;
}

function toItemView(
  item: QuestionItem,
  standards: Map<string, StandardNode>,
  components: Map<string, KnowledgeComponent>,
): CourseItemView {
  return {
    item,
    standardCodes: item.standardIds
      .map((id) => standards.get(id)?.sourceCode)
      .filter((code): code is string => Boolean(code)),
    componentLabels: item.knowledgeComponentIds
      .map((id) => components.get(id)?.label)
      .filter((label): label is string => Boolean(label)),
  };
}

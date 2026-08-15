import type {
  CompilationResult,
  KnowledgeComponent,
  Lesson,
  QuestionItem,
  StandardNode,
  WorkedExample,
} from "@contracts";
import { parseMathScene } from "./mathScene";

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
  | { kind: "warmup"; title: string; coach: string; prompts: string[]; pictureStem?: string }
  | { kind: "model"; title: string; coach: string; example?: WorkedExample; pictureStem?: string }
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

/** Last sentence of a stem — the question — so the picture can carry the setup. */
export function shortPrompt(stem: string): string {
  const parts = stem.trim().split(/(?<=[.?!])\s+/);
  return parts.at(-1) ?? stem;
}

/**
 * Kid path: look (the picture is the lesson), then try, then done.
 * Coach scripts stay off the phone. No picture means no look screen —
 * we do not invent a lesson from rejected items or empty stems.
 */
export function lessonBeats(lesson: CourseLessonView): LessonBeat[] {
  const beats: LessonBeat[] = [];
  lesson.items.forEach((item, index) => {
    if (parseMathScene(item.item.stem)) {
      beats.push({
        kind: "model",
        title: "Look",
        coach: "",
        pictureStem: item.item.stem,
      });
    }
    beats.push(
      index === 0
        ? {
            kind: "guided",
            title: "Try",
            coach: lesson.lesson.arc.guidedPractice,
            item,
          }
        : {
            kind: "practice",
            title: "Try",
            coach: lesson.lesson.arc.independentPractice,
            item,
            remaining: lesson.items.length - index - 1,
          },
    );
  });

  beats.push({
    kind: "wrap",
    title: "Finish",
    coach: lesson.lesson.arc.closingReview,
    prompts: lesson.lesson.deepExplanatoryQuestions,
  });

  return beats;
}

export function evaluateCourseContent(course: CourseWorkspace): {
  lessons: number;
  lookScreens: number;
  tryScreens: number;
  shippedItems: number;
  rejectedItems: number;
  picturedItems: number;
} {
  let lookScreens = 0;
  let tryScreens = 0;
  let picturedItems = 0;
  for (const lesson of course.lessons) {
    for (const beat of lessonBeats(lesson)) {
      if (beat.kind === "model") lookScreens += 1;
      if (beat.kind === "guided" || beat.kind === "practice") tryScreens += 1;
    }
    picturedItems += lesson.items.filter((entry) => parseMathScene(entry.item.stem)).length;
  }
  return {
    lessons: course.lessons.length,
    lookScreens,
    tryScreens,
    shippedItems: course.shippedCount,
    rejectedItems: course.rejectedCount,
    picturedItems,
  };
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

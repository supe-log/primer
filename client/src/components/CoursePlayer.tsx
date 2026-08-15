import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { CompilationResult, WorkedExample } from "@contracts";
import {
  buildCourseWorkspace,
  gradeOption,
  type CourseItemView,
  type CourseLessonView,
} from "@/lib/courseWorkspace";
import { Chip, Panel } from "./primitives";

/**
 * Learner-facing course after a compile. Reads only the compilation result —
 * frozen transfer cards work without the run store. Never claims the learner
 * mastered anything; a checked answer is a check, not a learning outcome.
 */
export function CoursePlayer({ result }: { result: CompilationResult }) {
  const course = useMemo(() => buildCourseWorkspace(result), [result]);
  const [lessonIndex, setLessonIndex] = useState(0);

  useEffect(() => {
    setLessonIndex(0);
  }, [result.runId]);

  if (!course) {
    return null;
  }

  const lesson = course.lessons[lessonIndex] ?? course.lessons[0];
  const atStart = lessonIndex <= 0;
  const atEnd = lessonIndex >= course.lessons.length - 1;

  return (
    <div className="space-y-6" data-testid="panel-course">
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <p className="font-medium">Draft course · not published · no learning claim</p>
        <p className="mt-1 text-muted-foreground">
          {course.title}. Status stays {result.status}, approval stays false. Checking an
          answer here is not evidence that anyone learned.
        </p>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Lessons" className="card min-w-0 p-4">
          <h2 className="text-sm font-semibold tracking-tight">Lessons</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {course.stage} · {course.subject} · {course.shippedCount} practice items
          </p>
          <ol className="mt-3 space-y-1.5">
            {course.lessons.map((entry) => {
              const active = entry.index === lessonIndex;
              return (
                <li key={entry.lesson.lessonId}>
                  <button
                    type="button"
                    onClick={() => setLessonIndex(entry.index)}
                    className={clsx(
                      "w-full rounded-md border px-3 py-2 text-left text-sm",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40",
                    )}
                    aria-current={active ? "step" : undefined}
                    data-testid={`button-lesson-${entry.index}`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(entry.index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-0.5 block font-medium">{entry.lesson.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {entry.items.length === 1 ? "1 item" : `${entry.items.length} items`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {lesson ? <LessonPane lesson={lesson} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:opacity-50"
          disabled={atStart}
          onClick={() => setLessonIndex((current) => Math.max(0, current - 1))}
          data-testid="button-lesson-prev"
        >
          Previous lesson
        </button>
        <p className="text-xs text-muted-foreground">
          Lesson {lessonIndex + 1} of {course.lessons.length}
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={atEnd}
          onClick={() => setLessonIndex((current) => Math.min(course.lessons.length - 1, current + 1))}
          data-testid="button-lesson-next"
        >
          Next lesson
        </button>
      </div>
    </div>
  );
}

function LessonPane({ lesson }: { lesson: CourseLessonView }) {
  return (
    <div className="min-w-0 space-y-6">
      <Panel
        title={lesson.lesson.title}
        subtitle={lesson.lesson.objective}
        testId={`panel-lesson-${lesson.index}`}
      >
        <div className="flex flex-wrap gap-1.5">
          {lesson.components.map((component) => (
            <Chip key={component.knowledgeComponentId}>{component.label}</Chip>
          ))}
        </div>

        <ol className="mt-5 space-y-3">
          {(
            [
              ["Review", lesson.lesson.arc.review],
              ["Model", lesson.lesson.arc.modelling],
              ["Guided practice", lesson.lesson.arc.guidedPractice],
              ["Independent practice", lesson.lesson.arc.independentPractice],
              ["Close", lesson.lesson.arc.closingReview],
            ] as const
          ).map(([label, body], index) => (
            <li key={label} className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")} {label}
              </span>
              <p className="mt-0.5">{body}</p>
            </li>
          ))}
        </ol>

        {lesson.lesson.workedExamples.length > 0 ? (
          <div className="mt-6">
            <h3 className="label">Worked examples</h3>
            <ul className="mt-2 space-y-3">
              {lesson.lesson.workedExamples.map((example, index) => (
                <WorkedExampleCard key={`${example.knowledgeComponentId}-${index}`} example={example} />
              ))}
            </ul>
          </div>
        ) : null}

        {lesson.lesson.retrievalPrompts.length > 0 ? (
          <div className="mt-6">
            <h3 className="label">Retrieval — say these without looking back</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {lesson.lesson.retrievalPrompts.map((prompt) => (
                <li key={prompt}>{prompt}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Practice"
        subtitle="Shipped items only. The key stays hidden until you check."
        testId={`panel-practice-${lesson.index}`}
      >
        {lesson.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shipped item is tagged to this lesson. Rejected items stay on the compiler
            side — they are proof the gates ran, not practice.
          </p>
        ) : (
          <ul className="space-y-4">
            {lesson.items.map((entry) => (
              <PracticeItem key={entry.item.itemId} entry={entry} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function WorkedExampleCard({ example }: { example: WorkedExample }) {
  const faded = new Set(example.fadedSteps);
  return (
    <li className="rounded-md border border-border bg-surface-alt p-3 text-sm">
      <p className="font-medium">{example.prompt}</p>
      <ol className="mt-2 space-y-1.5">
        {example.steps.map((step, index) => (
          <li key={`${example.prompt}-${index}`}>
            <span className="font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>{" "}
            {faded.has(index) ? (
              <span className="italic text-muted-foreground">Your turn — this step is faded.</span>
            ) : (
              step
            )}
          </li>
        ))}
      </ol>
    </li>
  );
}

function PracticeItem({ entry }: { entry: CourseItemView }) {
  const { item } = entry;
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSelected(null);
    setChecked(false);
  }, [item.itemId]);

  const grade = selected && checked ? gradeOption(item, selected) : null;

  return (
    <li
      className="rounded-md border border-border bg-surface-alt p-4"
      data-testid={`practice-item-${item.itemId}`}
    >
      <div className="flex flex-wrap gap-1.5">
        {entry.standardCodes.map((code) => (
          <Chip key={code}>{code}</Chip>
        ))}
        {entry.componentLabels.map((label) => (
          <Chip key={label}>{label}</Chip>
        ))}
      </div>
      <p className="mt-3 text-sm font-medium" id={`${item.itemId}-stem`}>
        {item.stem}
      </p>
      <fieldset className="mt-3" aria-labelledby={`${item.itemId}-stem`}>
        <legend className="sr-only">Options</legend>
        <div className="space-y-2" role="radiogroup">
          {item.options.map((option) => {
            const isSelected = selected === option.optionId;
            const showKey = Boolean(grade && option.optionId === grade.keyId);
            const showMiss = Boolean(grade && isSelected && !grade.correct);
            return (
              <label
                key={option.optionId}
                className={clsx(
                  "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  isSelected ? "border-primary bg-primary/10" : "border-border",
                  showKey && "border-success/50 bg-success/10",
                  showMiss && "border-error/50 bg-error/10",
                )}
              >
                <input
                  type="radio"
                  className="mt-1 accent-primary"
                  name={item.itemId}
                  value={option.optionId}
                  checked={isSelected}
                  disabled={checked}
                  onChange={() => setSelected(option.optionId)}
                  data-testid={`practice-option-${item.itemId}-${option.optionId}`}
                />
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{option.optionId}</span>{" "}
                  {option.text}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button
        type="button"
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
        disabled={!selected || checked}
        onClick={() => setChecked(true)}
        data-testid={`button-check-${item.itemId}`}
      >
        Check
      </button>
      {grade ? (
        <div
          className="mt-3 text-sm"
          role="status"
          aria-live="polite"
          data-testid={`practice-feedback-${item.itemId}`}
        >
          <p className="font-medium">
            {grade.correct ? "That matches the key." : `The key is ${grade.keyId}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{grade.keyRationale}</p>
          {!grade.correct && grade.selectedRationale ? (
            <p className="mt-1 text-muted-foreground">{grade.selectedRationale}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            A checked answer is not a claim about learning, difficulty or fairness.
          </p>
        </div>
      ) : null}
    </li>
  );
}

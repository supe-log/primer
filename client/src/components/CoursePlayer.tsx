import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { CompilationResult, WorkedExample } from "@contracts";
import {
  BEAT_LABEL,
  buildCourseWorkspace,
  friendlyLessonTitle,
  gradeOption,
  lessonBeats,
  type CourseItemView,
  type CourseLessonView,
  type CourseWorkspace,
  type LessonBeat,
} from "@/lib/courseWorkspace";
import { BEAT_TILE, KENNEY } from "@/lib/learnerArt";

/**
 * Kid-facing course in a phone-sized frame. One beat at a time, in the
 * explicit-instruction order the compiler already planned. Copy stays
 * age-appropriate for Year 7–8 and never claims anyone learned.
 */
export function CoursePlayer({ result }: { result: CompilationResult }) {
  const course = useMemo(() => buildCourseWorkspace(result), [result]);
  const [lessonIndex, setLessonIndex] = useState<number | null>(null);

  useEffect(() => {
    setLessonIndex(null);
  }, [result.runId]);

  if (!course) {
    return null;
  }

  const lesson = lessonIndex === null ? undefined : course.lessons[lessonIndex];

  return (
    <div className="flex flex-col items-center" data-testid="panel-course">
      <p className="mb-3 max-w-sm text-center text-xs text-muted-foreground">
        Learner view. The compiler stays on the other tab. Nothing here is a score
        or a claim about learning.
      </p>
      <div className="w-full max-w-[24.5rem] rounded-[2rem] border-[10px] border-[hsl(28_16%_18%)] bg-[hsl(28_16%_18%)] p-1">
        <div className="learner-device px-slice px-screen flex min-h-[38rem] flex-col">
          {lesson ? (
            <LessonApp
              course={course}
              lesson={lesson}
              onHome={() => setLessonIndex(null)}
            />
          ) : (
            <HomeScreen course={course} onOpen={setLessonIndex} />
          )}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({
  course,
  onOpen,
}: {
  course: CourseWorkspace;
  onOpen: (index: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Today</p>
      <h2 className="mt-1 text-2xl font-bold leading-tight">Let’s practise</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {course.stage} {course.subject}. One short lesson at a time.
      </p>
      <ol className="mt-5 flex-1 space-y-3">
        {course.lessons.map((entry) => (
          <li key={entry.lesson.lessonId}>
            <button
              type="button"
              onClick={() => onOpen(entry.index)}
              className="px-slice px-card w-full px-4 py-3 text-left"
              data-testid={`button-lesson-${entry.index}`}
            >
              <span className="text-xs font-semibold text-primary">
                Lesson {entry.index + 1}
              </span>
              <span className="mt-0.5 block text-base font-semibold">
                {friendlyLessonTitle(entry)}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {entry.items.length === 0
                  ? "Walk-through only"
                  : entry.items.length === 1
                    ? "1 practice question"
                    : `${entry.items.length} practice questions`}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        From the Australian Curriculum · draft
      </p>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        UI tiles: Kenney.nl · CC0
      </p>
    </div>
  );
}

function LessonApp({
  course,
  lesson,
  onHome,
}: {
  course: CourseWorkspace;
  lesson: CourseLessonView;
  onHome: () => void;
}) {
  const beats = useMemo(() => lessonBeats(lesson), [lesson]);
  const [beatIndex, setBeatIndex] = useState(0);

  useEffect(() => {
    setBeatIndex(0);
  }, [lesson.lesson.lessonId]);

  const beat = beats[beatIndex];
  const atEnd = beatIndex >= beats.length - 1;

  return (
    <div className="flex min-h-[38rem] flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <button type="button" className="learner-btn-quiet px-3" onClick={onHome}>
          Lessons
        </button>
        <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">
          {friendlyLessonTitle(lesson)}
        </p>
        <span className="text-xs text-muted-foreground">
          {beatIndex + 1}/{beats.length}
        </span>
      </header>
      <ol className="flex items-center gap-1 px-4" aria-label="Lesson steps">
        {beats.map((entry, index) => (
          <li key={`${entry.kind}-${index}`} className="flex-1">
            <img
              src={index <= beatIndex ? BEAT_TILE[entry.kind] : KENNEY.grey}
              alt=""
              className="h-3 w-full"
              style={{ imageRendering: "pixelated" }}
            />
          </li>
        ))}
      </ol>
      <p className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-primary">
        {beat ? BEAT_LABEL[beat.kind] : ""}
      </p>
      <div className="flex-1 overflow-y-auto px-4 pb-3 pt-1">
        {beat ? <BeatBody beat={beat} /> : null}
      </div>
      <footer className="border-t border-border px-4 py-3">
        <button
          type="button"
          className="learner-btn"
          onClick={() => {
            if (atEnd) {
              onHome();
              return;
            }
            setBeatIndex((current) => current + 1);
          }}
          data-testid={atEnd ? "button-lesson-home" : "button-lesson-next"}
        >
          {atEnd ? "Back to lessons" : "Next"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {course.stage} · practice only · not a test score
        </p>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          UI tiles: Kenney.nl · CC0
        </p>
      </footer>
    </div>
  );
}

function BeatBody({ beat }: { beat: LessonBeat }) {
  if (beat.kind === "warmup") {
    return (
      <div>
        <h3 className="text-xl font-bold leading-tight">Get your brain ready</h3>
        <p className="mt-2 text-sm leading-relaxed">{beat.coach}</p>
        {beat.prompts.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {beat.prompts.map((prompt) => (
              <li
                key={prompt}
                className="px-slice px-card-yellow px-4 py-3 text-sm leading-relaxed"
              >
                {prompt}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-sm text-muted-foreground">
          Say the answers out loud, or just think them. Then go on.
        </p>
      </div>
    );
  }

  if (beat.kind === "model") {
    return (
      <div>
        <h3 className="text-xl font-bold leading-tight">Watch how this one works</h3>
        <p className="mt-2 text-sm leading-relaxed">{beat.coach}</p>
        {beat.example ? <WorkedExampleCard example={beat.example} /> : null}
      </div>
    );
  }

  if (beat.kind === "guided") {
    return (
      <div>
        <h3 className="text-xl font-bold leading-tight">Try this with a hint nearby</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{beat.coach}</p>
        <PracticeItem entry={beat.item} />
      </div>
    );
  }

  if (beat.kind === "practice") {
    return (
      <div>
        <h3 className="text-xl font-bold leading-tight">Your turn</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {beat.remaining === 0
            ? "Last question in this lesson."
            : `${beat.remaining} more after this.`}
        </p>
        <PracticeItem entry={beat.item} />
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-xl font-bold leading-tight">Nice work for today</h3>
      <p className="mt-2 text-sm leading-relaxed">{beat.coach}</p>
      {beat.prompts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {beat.prompts.map((prompt) => (
            <li
              key={prompt}
              className="px-slice px-card px-4 py-3 text-sm leading-relaxed"
            >
              {prompt}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-sm text-muted-foreground">
        Checking answers here is practice. It is not a mark, and it does not
        prove what you have learned.
      </p>
    </div>
  );
}

function WorkedExampleCard({ example }: { example: WorkedExample }) {
  const faded = new Set(example.fadedSteps);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="px-slice px-card-blue mt-4 p-4">
      <p className="text-sm font-semibold">{example.prompt}</p>
      <ol className="mt-3 space-y-2">
        {example.steps.map((step, index) => {
          const hidden = faded.has(index) && !revealed;
          return (
            <li key={`${example.prompt}-${index}`} className="text-sm leading-relaxed">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-alt text-xs font-semibold">
                {index + 1}
              </span>
              {hidden ? (
                <span className="text-muted-foreground">Your turn — think this step.</span>
              ) : (
                step
              )}
            </li>
          );
        })}
      </ol>
      {example.fadedSteps.length > 0 && !revealed ? (
        <button
          type="button"
          className="learner-btn-quiet mt-3 w-full"
          onClick={() => setRevealed(true)}
        >
          Show the last steps
        </button>
      ) : null}
    </div>
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
    <div className="mt-4" data-testid={`practice-item-${item.itemId}`}>
      {entry.standardCodes[0] ? (
        <p className="text-[11px] font-medium text-muted-foreground">{entry.standardCodes[0]}</p>
      ) : null}
      <p className="mt-1 text-base font-semibold leading-snug" id={`${item.itemId}-stem`}>
        {item.stem}
      </p>
      <fieldset className="mt-3" aria-labelledby={`${item.itemId}-stem`}>
        <legend className="sr-only">Choose an answer</legend>
        <div className="space-y-2" role="radiogroup">
          {item.options.map((option) => {
            const isSelected = selected === option.optionId;
            const showKey = Boolean(grade && option.optionId === grade.keyId);
            const showMiss = Boolean(grade && isSelected && !grade.correct);
            return (
              <label
                key={option.optionId}
                className={clsx(
                  "px-slice flex min-h-12 cursor-pointer items-start gap-3 px-3 py-3 text-sm",
                  showKey && "px-choice-yes",
                  showMiss && "px-choice-no",
                  isSelected && !grade && "px-choice-on",
                  !isSelected && !grade && "px-choice",
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
                  <span className="font-semibold">{option.optionId}.</span> {option.text}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button
        type="button"
        className="learner-btn mt-3"
        disabled={!selected || checked}
        onClick={() => setChecked(true)}
        data-testid={`button-check-${item.itemId}`}
      >
        Check my answer
      </button>
      {grade ? (
        <div
          className={clsx(
            "px-slice mt-3 px-4 py-3 text-sm leading-relaxed",
            grade.correct ? "px-choice-yes" : "px-card",
          )}
          role="status"
          aria-live="polite"
          data-testid={`practice-feedback-${item.itemId}`}
        >
          <p className="font-semibold">
            {grade.correct ? "Yes — that’s the one." : `Not that one. The matching answer is ${grade.keyId}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{grade.keyRationale}</p>
          {!grade.correct && grade.selectedRationale ? (
            <p className="mt-1 text-muted-foreground">{grade.selectedRationale}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

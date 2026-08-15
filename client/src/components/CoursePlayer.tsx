import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { CompilationResult } from "@contracts";
import {
  buildCourseWorkspace,
  gradeOption,
  lessonBeats,
  shortPrompt,
  type CourseItemView,
  type CourseLessonView,
  type CourseWorkspace,
  type LessonBeat,
} from "@/lib/courseWorkspace";
import { KENNEY } from "@/lib/learnerArt";
import { PixelBuddy, PixelBurst, PixelStar, PixelSun } from "@/components/learnerPixels";
import { MathPicture } from "@/components/MathScene";

const LESSON_FACE = [KENNEY.yellow, KENNEY.blue, KENNEY.green] as const;

/**
 * The student app. One picture, one question, three taps.
 * No coach script, no scores, no compiler chrome.
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
    <div className="flex w-full justify-center" data-testid="panel-course">
      <div className="w-full max-w-[24.5rem] rounded-[2rem] border-[10px] border-[hsl(28_16%_18%)] bg-[hsl(28_16%_18%)] p-1">
        <div className="learner-device px-slice px-screen flex min-h-[40rem] flex-col">
          {lesson ? (
            <LessonApp lesson={lesson} onHome={() => setLessonIndex(null)} />
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
    <div className="flex flex-1 flex-col px-5 pb-6 pt-6">
      <div className="relative flex items-end gap-3">
        <PixelSun size={32} className="absolute right-0 top-0" />
        <PixelBuddy size={80} className="pixel-bob" />
        <div>
          <p className="learner-pixel text-sm font-bold text-primary">Pip</p>
          <h2 className="learner-pixel mt-0.5 text-3xl font-bold leading-none">Let’s play</h2>
        </div>
      </div>
      <ol className="mt-8 flex-1 space-y-4">
        {course.lessons.map((entry) => (
          <li key={entry.lesson.lessonId}>
            <button
              type="button"
              onClick={() => onOpen(entry.index)}
              className="px-slice px-card flex w-full items-center gap-4 px-3 py-4 text-left"
              data-testid={`button-lesson-${entry.index}`}
            >
              <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center">
                <img
                  src={LESSON_FACE[entry.index % LESSON_FACE.length]}
                  alt=""
                  className="absolute inset-0 h-14 w-14"
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="learner-pixel relative text-2xl font-bold">{entry.index + 1}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="learner-pixel block text-xl font-bold">Lesson {entry.index + 1}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">Look, then try</span>
              </span>
              <span className="learner-pixel text-lg font-bold text-primary">GO</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function LessonApp({
  lesson,
  onHome,
}: {
  lesson: CourseLessonView;
  onHome: () => void;
}) {
  const beats = useMemo(() => lessonBeats(lesson), [lesson]);
  const [beatIndex, setBeatIndex] = useState(0);
  const [canAdvance, setCanAdvance] = useState(false);

  useEffect(() => {
    setBeatIndex(0);
    setCanAdvance(false);
  }, [lesson.lesson.lessonId]);

  const beat = beats[beatIndex];
  const atEnd = beatIndex >= beats.length - 1;
  const needsCheck = beat?.kind === "guided" || beat?.kind === "practice";

  return (
    <div className="flex min-h-[40rem] flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <button type="button" className="learner-btn-quiet px-3" onClick={onHome}>
          Home
        </button>
        <ol className="flex flex-1 items-center gap-1.5" aria-label="Progress">
          {beats.map((entry, index) => (
            <li
              key={`${entry.kind}-${index}`}
              className={clsx(
                "h-2 flex-1",
                index <= beatIndex ? "bg-[#6abe30]" : "bg-[hsl(40_20%_80%)]",
              )}
            />
          ))}
        </ol>
      </header>
      <div className="flex-1 overflow-y-auto px-4 pb-3 pt-2">
        {beat ? <BeatBody beat={beat} onGraded={setCanAdvance} /> : null}
      </div>
      {!needsCheck || canAdvance ? (
        <footer className="px-4 pb-4 pt-1">
          <button
            type="button"
            className="learner-btn"
            onClick={() => {
              if (atEnd) {
                onHome();
                return;
              }
              setCanAdvance(false);
              setBeatIndex((current) => current + 1);
            }}
            data-testid={atEnd ? "button-lesson-home" : "button-lesson-next"}
          >
            {atEnd ? "Home" : "Next"}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function BeatBody({
  beat,
  onGraded,
}: {
  beat: LessonBeat;
  onGraded: (ready: boolean) => void;
}) {
  if (beat.kind === "model" && beat.pictureStem) {
    return (
      <div>
        <h3 className="learner-pixel text-2xl font-bold">Look</h3>
        <MathPicture stem={beat.pictureStem} mode="look" />
      </div>
    );
  }

  if (beat.kind === "guided" || beat.kind === "practice") {
    return <PracticeItem entry={beat.item} onGraded={onGraded} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 pt-8 text-center">
      <PixelBuddy size={88} className="pixel-bob" />
      <PixelBurst />
      <h3 className="learner-pixel text-3xl font-bold">Done</h3>
    </div>
  );
}

function PracticeItem({
  entry,
  onGraded,
}: {
  entry: CourseItemView;
  onGraded: (ready: boolean) => void;
}) {
  const { item } = entry;
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSelected(null);
    setChecked(false);
    onGraded(false);
  }, [item.itemId, onGraded]);

  const grade = selected && checked ? gradeOption(item, selected) : null;

  return (
    <div data-testid={`practice-item-${item.itemId}`}>
      <MathPicture stem={item.stem} mode="hint" />
      <p className="mt-4 text-lg font-bold leading-snug" id={`${item.itemId}-stem`}>
        {shortPrompt(item.stem)}
      </p>
      <fieldset className="mt-4" aria-labelledby={`${item.itemId}-stem`}>
        <legend className="sr-only">Choose an answer</legend>
        <div className="space-y-3" role="radiogroup">
          {item.options.map((option) => {
            const isSelected = selected === option.optionId;
            const showKey = Boolean(grade && option.optionId === grade.keyId);
            const showMiss = Boolean(grade && isSelected && !grade.correct);
            return (
              <label
                key={option.optionId}
                className={clsx(
                  "px-slice flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-lg font-semibold",
                  showKey && "px-choice-yes",
                  showMiss && "px-choice-no",
                  isSelected && !grade && "px-choice-on",
                  !isSelected && !grade && "px-choice",
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={item.itemId}
                  value={option.optionId}
                  checked={isSelected}
                  disabled={checked}
                  onChange={() => setSelected(option.optionId)}
                  data-testid={`practice-option-${item.itemId}-${option.optionId}`}
                />
                <span className="learner-pixel text-sm text-primary">{option.optionId}</span>
                <span>{option.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {!checked ? (
        <button
          type="button"
          className="learner-btn mt-4"
          disabled={!selected}
          onClick={() => {
            setChecked(true);
            onGraded(true);
          }}
          data-testid={`button-check-${item.itemId}`}
        >
          Check
        </button>
      ) : null}
      {grade ? (
        <p
          className="learner-pixel mt-4 text-center text-xl font-bold"
          role="status"
          aria-live="polite"
          data-testid={`practice-feedback-${item.itemId}`}
        >
          {grade.correct ? (
            <span className="inline-flex items-center gap-2">
              <PixelStar size={22} /> Yes
            </span>
          ) : (
            `It’s ${grade.keyId}`
          )}
        </p>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { CompilationRequest, type CompilationRequest as CompilationRequestType } from "@contracts";
import {
  defaultStandardIdsForStage,
  standardsForStage,
  YEAR_6_UNFETCHED,
  YEAR_7_STANDARDS,
} from "../lib/stageCatalogue";
import { LicenceBadge, Panel } from "./primitives";

/**
 * The intake form. Deliberately plain controlled inputs: Engineer 2 can replace the
 * whole body without touching the compiler, as long as it still emits a value that
 * parses against CompilationRequest.
 *
 * There is no student personal information field here and there must never be one.
 */

/** @deprecated Use standardsForStage. Kept so existing demo tests keep a stable import. */
export const STANDARD_OPTIONS = YEAR_7_STANDARDS;

export function IntakeForm({
  initial,
  pending,
  onSubmit,
}: {
  initial: CompilationRequestType;
  pending: boolean;
  onSubmit: (request: CompilationRequestType) => void;
}) {
  const [stageLabel, setStageLabel] = useState(initial.stage.localLabel);
  const [subject, setSubject] = useState(initial.subject);
  const [standardIds, setStandardIds] = useState<string[]>(initial.standardIds);
  const stageStandards = standardsForStage(stageLabel);
  const [goal, setGoal] = useState(initial.goal);
  const [priorKnowledge, setPriorKnowledge] = useState(
    initial.learnerContext.priorKnowledgeNotes,
  );
  const [assessmentTarget, setAssessmentTarget] = useState(initial.assessmentTarget);
  const [lessonCount, setLessonCount] = useState(initial.lessonCount);
  const [issues, setIssues] = useState<string[]>([]);

  const stages: Record<string, [number, number, number]> = {
    "Year 6": [11, 12, 7],
    "Year 7": [12, 13, 8],
    "Year 8": [13, 14, 9],
  };

  function submit() {
    const band = stages[stageLabel] ?? [12, 13, 8];
    const candidate = {
      ...initial,
      stage: { localLabel: stageLabel, ageBand: [band[0], band[1]], ordinal: band[2] },
      subject,
      standardIds,
      goal,
      learnerContext: { ...initial.learnerContext, priorKnowledgeNotes: priorKnowledge },
      assessmentTarget,
      lessonCount,
    };

    const parsed = CompilationRequest.safeParse(candidate);
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      return;
    }
    setIssues([]);
    onSubmit(parsed.data);
  }

  return (
    <Panel
      title="Compile a course"
      subtitle="Jurisdiction, stage, subject and standards come from a snapshot. Free-text standards are disabled so every artifact stays traceable."
      testId="panel-intake"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="label" htmlFor="jurisdiction">
              Jurisdiction
            </label>
            <LicenceBadge posture="redistributable" licenceId="cc-by-4.0" />
          </div>
          <input
            id="jurisdiction"
            className="field mt-1.5"
            value="Australia, ACARA V9"
            readOnly
            data-testid="input-jurisdiction"
          />
          <p className="mt-1.5 break-words text-xs text-muted-foreground">
            Australian Curriculum, Assessment and Reporting Authority (ACARA), licensed CC BY 4.0.
            Logos, site design, third-party material and the National Literacy Learning Progressions
            are excluded.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="stage">
            Stage
          </label>
          <select
            id="stage"
            className="field mt-1.5"
            value={stageLabel}
            onChange={(event) => {
              const next = event.target.value;
              setStageLabel(next);
              const fetched = defaultStandardIdsForStage(next);
              setStandardIds(fetched.length > 0 ? fetched : [YEAR_6_UNFETCHED.id]);
            }}
            data-testid="select-stage"
          >
            {Object.keys(stages).map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            className="field mt-1.5"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            data-testid="input-subject"
          />
        </div>

        <div>
          <label className="label" htmlFor="lessons">
            Lessons
          </label>
          <input
            id="lessons"
            type="number"
            min={1}
            max={12}
            className="field mt-1.5"
            value={lessonCount}
            onChange={(event) => setLessonCount(Number(event.target.value))}
            data-testid="input-lesson-count"
          />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="label">Standards from the snapshot</legend>
          <div className="mt-2 space-y-2">
            {stageStandards.map((option) => (
              <label key={option.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={standardIds.includes(option.id)}
                  disabled={!option.fetched}
                  onChange={(event) =>
                    setStandardIds((current) =>
                      event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                  data-testid={`checkbox-standard-${option.id}`}
                />
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{option.id}</span>
                  <span className="block">{option.label}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stageLabel === "Year 6"
              ? "Year 6 has no hashed snapshot. The compiler will refuse rather than invent content descriptions."
              : `Official ACARA V9 ${stageLabel} codes from the hashed snapshot. The compiler reads them; it does not author them.`}
          </p>
        </fieldset>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="goal">
            Goal
          </label>
          <input
            id="goal"
            className="field mt-1.5"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            data-testid="input-goal"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="prior">
            Learner context
          </label>
          <textarea
            id="prior"
            rows={3}
            className="field mt-1.5"
            value={priorKnowledge}
            onChange={(event) => setPriorKnowledge(event.target.value)}
            data-testid="input-learner-context"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Describe the class, never a named student. This app collects no student information.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="target">
            Assessment target
          </label>
          <select
            id="target"
            className="field mt-1.5"
            value={assessmentTarget}
            onChange={(event) =>
              setAssessmentTarget(event.target.value as CompilationRequestType["assessmentTarget"])
            }
            data-testid="select-assessment-target"
          >
            <option value="none">None</option>
            <option value="unit_test">Unit test</option>
            <option value="official_exam_emulation">Official exam emulation</option>
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Official exam emulation needs a fetched blueprint. Without one the compiler refuses
            before it generates anything.
          </p>
        </div>
      </div>

      {issues.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground
          transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
        data-testid="button-compile"
      >
        {pending ? "Compiling…" : "Compile"}
      </button>
    </Panel>
  );
}

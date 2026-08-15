import type { CompilationResult } from "@contracts";
import { Chip, Panel } from "./primitives";

/**
 * Artifact summary: the compiled course at a glance. Shows what shipped, what was
 * rejected and why, and where each sequencing decision came from.
 */
export function ArtifactSummary({ result }: { result: CompilationResult }) {
  const { graph, coursePlan, items, sourceManifest } = result;

  if (!graph || !coursePlan) {
    return (
      <Panel title="Artifacts" subtitle="Nothing was generated." testId="panel-artifacts">
        <p className="text-sm text-muted-foreground">
          This run was refused, so there are no artifacts. The refusal panel names what is missing.
        </p>
      </Panel>
    );
  }

  const shipped = items.filter((item) => !item.rejection);
  const rejected = items.filter((item) => item.rejection);

  return (
    <Panel
      title={coursePlan.title}
      subtitle={`${graph.knowledgeComponents.length} knowledge components · ${graph.prerequisiteEdges.length} prerequisite edges · ${coursePlan.lessons.length} lessons · ${shipped.length} items shipped, ${rejected.length} rejected`}
      testId="panel-artifacts"
    >
      <div className="space-y-6">
        <div>
          <h3 className="label">Sequence</h3>
          <ol className="mt-2 space-y-2">
            {coursePlan.lessons.map((lesson, index) => (
              <li key={lesson.lessonId} className="text-sm" data-testid={`row-lesson-${index}`}>
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>{" "}
                <span className="font-medium">{lesson.title}</span>
                <p className="mt-0.5 text-muted-foreground">{lesson.objective}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {lesson.decisions.map((decision) => (
                    <Chip key={`${lesson.lessonId}-${decision.lever}`}>
                      {decision.lever.replace(/_/g, " ")} · {decision.evidenceLevel}
                    </Chip>
                  ))}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="label">Items</h3>
          <ul className="mt-2 space-y-3">
            {items.map((item) => (
              <li
                key={item.itemId}
                className="rounded-md border border-border bg-surface-alt p-3 text-sm"
                data-testid={`card-item-${item.itemId}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{item.itemId}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <Chip>{item.difficulty.band}</Chip>
                    <Chip>key {item.correctOptionId}</Chip>
                    {item.difficulty.calibrated ? null : <Chip>uncalibrated</Chip>}
                    {item.rejection ? <Chip>rejected</Chip> : null}
                  </span>
                </div>
                <p className="mt-1.5">{item.stem}</p>
                <ul className="mt-2 space-y-1">
                  {item.options.map((option) => (
                    <li key={option.optionId} className="text-xs text-muted-foreground">
                      <span className="font-mono">{option.optionId}</span> {option.text}
                      {option.misconceptionId ? (
                        <span className="font-mono"> · {option.misconceptionId}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {item.rejection ? (
                  <p className="mt-2 text-xs text-error" data-testid={`text-rejection-${item.itemId}`}>
                    Rejected by {item.rejection.checkId}: {item.rejection.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="label">Sources and licences</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {sourceManifest.sources.map((source) => (
              <li key={source.sourceId} data-testid={`row-source-${source.sourceId}`}>
                <a
                  className="text-primary underline decoration-primary/40 underline-offset-2"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {source.licence.licenceId} · {source.licence.posture}
                  {source.fetched ? "" : " · sample, not fetched"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

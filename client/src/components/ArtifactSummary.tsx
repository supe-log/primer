import { useState } from "react";
import clsx from "clsx";
import type {
  CompilationResult,
  KnowledgeComponent,
  SourceSnapshot,
} from "@contracts";
import { computeCoverage } from "@/lib/coverage";
import { Chip, LicenceBadge, Panel } from "./primitives";

/**
 * Artifact summary: the compiled course at a glance. Shows what shipped, what was
 * rejected and why, and where each sequencing decision came from.
 */
export function ArtifactSummary({ result }: { result: CompilationResult }) {
  const { graph, coursePlan, items, sourceManifest } = result;

  const abstained = result.gateReport.checks.filter((check) => check.status === "abstain");

  if (!graph || !coursePlan) {
    return (
      <Panel title="Artifacts" subtitle="Nothing was generated." testId="panel-artifacts">
        <p className="text-sm text-muted-foreground">
          This run was refused, so there are no artifacts. The refusal panel names what is missing.
        </p>
        <AbstainRows checks={abstained} />
      </Panel>
    );
  }

  const shipped = items.filter((item) => !item.rejection);
  const rejected = items.filter((item) => item.rejection);
  const sourcesById = new Map(sourceManifest.sources.map((source) => [source.sourceId, source]));
  const featured = graph.knowledgeComponents.find((node) => node.evidence.length > 0)
    ?? graph.knowledgeComponents[0];

  return (
    <Panel
      title={coursePlan.title}
      subtitle={`${graph.knowledgeComponents.length} knowledge components · ${graph.prerequisiteEdges.length} prerequisite edges · ${coursePlan.lessons.length} lessons · ${shipped.length} items shipped, ${rejected.length} rejected`}
      testId="panel-artifacts"
    >
      <div className="space-y-6">
        {featured ? (
          <ProvenanceNode
            node={featured}
            source={featured.evidence[0] ? sourcesById.get(featured.evidence[0].sourceId) : undefined}
          />
        ) : null}

        <CoverageMatrix result={result} />
        <AbstainRows checks={abstained} />

        <div>
          <h3 className="label">Sequence</h3>
          <ol className="mt-2 space-y-3">
            {coursePlan.lessons.map((lesson, index) => (
              <li key={lesson.lessonId} className="text-sm" data-testid={`row-lesson-${index}`}>
                <span className="font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>{" "}
                <span className="font-medium">{lesson.title}</span>
                <p className="mt-0.5 text-muted-foreground">{lesson.objective}</p>
                <ul className="mt-2 space-y-2">
                  {lesson.decisions.map((decision) => (
                    <li key={`${lesson.lessonId}-${decision.lever}`}>
                      <Chip>
                        {decision.lever.replace(/_/g, " ")} · {decision.evidenceLevel}
                      </Chip>
                      <p className="mt-1 text-muted-foreground">{decision.reason}</p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>

        {rejected.length > 0 ? (
          <div>
            <h3 className="label text-error">Rejected by gates</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Rejected items stay visible. Deleting them would hide the proof the gates ran.
            </p>
            <ul className="mt-2 space-y-3">
              {rejected.map((item) => (
                <ItemCard key={item.itemId} item={item} rejected />
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="label">Items shipped</h3>
          <ul className="mt-2 space-y-3">
            {shipped.map((item) => (
              <ItemCard key={item.itemId} item={item} />
            ))}
          </ul>
        </div>

        <div>
          <h3 className="label">Sources and licences</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {sourceManifest.sources.map((source) => (
              <li
                key={source.sourceId}
                className="flex flex-wrap items-baseline gap-2"
                data-testid={`row-source-${source.sourceId}`}
              >
                <a
                  className="text-primary underline decoration-primary/40 underline-offset-2"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
                <LicenceBadge posture={source.licence.posture} licenceId={source.licence.licenceId} />
                {source.fetched ? null : (
                  <span className="font-mono text-xs text-muted-foreground">sample, not fetched</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function CoverageMatrix({ result }: { result: CompilationResult }) {
  const coverage = computeCoverage(result);

  return (
    <div data-testid="panel-coverage">
      <h3 className="label">Coverage</h3>
      <p className="mt-1 text-sm" data-testid="text-coverage-percent">
        {coverage.percent} percent of requested standards map to a knowledge component and a
        shipped item. Computed from the artifacts, not asserted.
      </p>
      <ul className="mt-2 divide-y divide-border rounded-md border border-border">
        {coverage.rows.map((row) => (
          <li
            key={row.standardId}
            className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[7rem_1fr_auto]"
            data-testid={`row-coverage-${row.standardId}`}
          >
            <span className="font-mono text-xs text-muted-foreground">{row.sourceCode}</span>
            <span className="min-w-0 break-words">{row.statement}</span>
            <span className="font-mono text-xs">
              {row.mapped ? "mapped" : "unmapped"} · {row.assessed ? "assessed" : "unassessed"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbstainRows({
  checks,
}: {
  checks: CompilationResult["gateReport"]["checks"];
}) {
  if (checks.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-warning/40 bg-warning/10 p-3"
      data-testid="row-abstain"
    >
      <h3 className="label text-warning">Honest abstain</h3>
      <ul className="mt-2 space-y-2">
        {checks.map((check) => (
          <li key={check.checkId} className="text-sm">
            <span className="font-medium">{check.label}</span>
            <p className="mt-0.5 text-muted-foreground">
              {check.detail} Recorded as null, not a pass.
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProvenanceNode({
  node,
  source,
}: {
  node: KnowledgeComponent;
  source?: SourceSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const evidence = node.evidence[0];

  return (
    <div>
      <h3 className="label">Knowledge component provenance</h3>
      <div
        className="mt-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          className="w-full min-w-0 rounded-md border border-border bg-surface-alt p-3 text-left text-sm"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          aria-expanded={open}
          data-testid="button-provenance-node"
        >
          <span className="font-medium">{node.label}</span>
          <span className="ml-2 break-all font-mono text-xs text-muted-foreground">
            {node.knowledgeComponentId}
          </span>
          <p className="mt-1 text-muted-foreground">{node.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Hover or focus for source span, hash and licence.
          </p>
        </button>
        {open ? (
          <div
            className="mt-2 w-full min-w-0 rounded-md border border-border bg-surface p-3 text-sm"
            data-testid="popover-provenance"
          >
            {evidence ? (
              <dl className="space-y-1.5">
                <Row term="source" value={evidence.sourceId} />
                <Row
                  term="span"
                  value={
                    source && source.licence.posture !== "redistributable"
                      ? "Cite-only source. Span held internally, not shown."
                      : `“${evidence.quotedSpan}”`
                  }
                />
                {evidence.locator ? <Row term="locator" value={evidence.locator} /> : null}
                {source ? (
                  <>
                    <Row term="publisher" value={source.publisher} />
                    <Row
                      term="hash"
                      value={source.fetched ? source.contentSha256.slice(0, 12) : "sample digest"}
                    />
                    <Row term="licence" value={`${source.licence.licenceId} · ${source.licence.posture}`} />
                  </>
                ) : null}
                <Row
                  term="confidence"
                  value={`${node.confidence.value} · unmeasured: ${node.confidence.unmeasured.join(", ") || "none"}`}
                />
              </dl>
            ) : (
              <p className="text-muted-foreground">
                No evidence span on this node. The gate lists that as missing evidence.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[6.5rem_1fr] sm:gap-2">
      <dt className="font-mono text-xs text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function ItemCard({
  item,
  rejected = false,
}: {
  item: CompilationResult["items"][number];
  rejected?: boolean;
}) {
  return (
    <li
      className={clsx(
        "rounded-md border p-3 text-sm",
        rejected ? "border-error/50 bg-error/5" : "border-border bg-surface-alt",
      )}
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
        <p className="mt-2 text-sm text-error" data-testid={`text-rejection-${item.itemId}`}>
          Rejected by {item.rejection.checkId}: {item.rejection.reason}
        </p>
      ) : null}
    </li>
  );
}

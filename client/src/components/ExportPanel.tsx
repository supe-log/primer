import type { PublicExportBundle } from "@/lib/views";
import { citationRows } from "@/lib/exportView";
import { Chip, Panel } from "./primitives";

/**
 * Public export from GET /export. Citations, links and attribution only for
 * cite-only sources. Quoted snapshot bodies never render here.
 */

export function ExportPanel({
  exported,
  runId,
  fromFixture = false,
}: {
  exported: PublicExportBundle | null;
  runId?: string;
  fromFixture?: boolean;
}) {
  const rows = exported ? citationRows(exported) : [];

  return (
    <Panel
      title="Export and citations"
      subtitle={
        exported
          ? `${exported.citations.length} sources · ${exported.licence.citeOnlySourceIds.length} cite-only. Observing is always allowed.`
          : fromFixture
            ? "Frozen transfer cases have no public export. Compile live to load citations."
            : runId
              ? "No export recorded for this run."
              : "Compile a course to load the public export."
      }
      testId="panel-export"
    >
      {!exported ? (
        <p className="text-sm text-muted-foreground">
          The export route is the artifact that may leave the box. Cite-only source
          text is stripped before it reaches this panel.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm" data-testid="text-export-licence">
            Cite-only sources appear as a citation and a link. Their snapshot bodies
            are not shown.
            {exported.licence.strippedSourceIds.length > 0
              ? ` Stripped ${exported.licence.strippedSourceIds.length} leaked body${exported.licence.strippedSourceIds.length === 1 ? "" : "s"}.`
              : ""}
          </p>

          <div>
            <h3 className="label">Citations</h3>
            <ul className="mt-2 space-y-3">
              {rows.map((row) => (
                <li
                  key={row.citation.sourceId}
                  className="rounded-md border border-border bg-surface-alt p-3 text-sm"
                  data-testid={`row-citation-${row.citation.sourceId}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <a
                      className="text-primary underline decoration-primary/40 underline-offset-2"
                      href={row.citation.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.citation.title}
                    </a>
                    <Chip>
                      <span data-testid={`chip-posture-${row.citation.sourceId}`}>
                        {row.citeOnly ? "cite only" : row.citation.posture.replace(/_/g, " ")}
                      </span>
                    </Chip>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.citation.publisher}</p>
                  <p className="mt-1.5" data-testid={`text-attribution-${row.citation.sourceId}`}>
                    {row.citation.attributionText}
                  </p>
                  {row.quote ? (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs text-muted-foreground">
                      {row.quote}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="label">Alignment</h3>
            <p className="mt-1.5 text-sm" data-testid="text-export-coverage">
              {exported.alignment.coverageOk
                ? `Every requested standard is mapped and assessed (${exported.alignment.mappedStandardIds.length}).`
                : `Coverage incomplete: ${exported.alignment.mappedStandardIds.length} mapped, ${exported.alignment.assessedStandardIds.length} assessed, of ${exported.alignment.requestedStandardIds.length} requested.`}
            </p>
          </div>

          {exported.course ? (
            <div>
              <h3 className="label">Public course</h3>
              <p className="mt-1.5 text-sm font-medium">{exported.course.title}</p>
              <ol className="mt-2 space-y-1.5 text-sm">
                {exported.course.lessons.map((lesson, index) => (
                  <li key={lesson.lessonId} data-testid={`row-export-lesson-${index}`}>
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>{" "}
                    {lesson.title}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

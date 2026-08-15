import type { CompilationResult } from "@contracts";
import { CheckStatus, Panel, VerdictBadge } from "./primitives";

/**
 * Gate verdict and refusal. This is the panel the demo ends on: what the run earned,
 * what it did not, and what is missing.
 */
export function GateVerdictPanel({ result }: { result: CompilationResult }) {
  const { gateReport, refusal, status } = result;

  return (
    <Panel
      title="Gate"
      subtitle={gateReport.summary}
      testId="panel-gate"
      action={<VerdictBadge verdict={gateReport.verdict} />}
    >
      <p className="text-sm">
        Status <span className="font-mono">{status}</span> at permission tier{" "}
        <span className="font-mono" data-testid="text-permission">
          {gateReport.permission}
        </span>
        . Publication is a human act: this result comes back with approval false either way.
      </p>

      {refusal ? (
        <div
          className="mt-4 rounded-md border border-error/40 bg-error/10 p-4"
          data-testid="panel-refusal"
        >
          <h3 className="text-sm font-semibold text-error">
            Refused: {refusal.code.replace(/_/g, " ")}
          </h3>
          <p className="mt-1 text-sm">{refusal.requested}</p>
          <h4 className="label mt-3">Missing evidence</h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {refusal.missingEvidence.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
          <h4 className="label mt-3">Collection plan</h4>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">
            {refusal.collectionPlan.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="label">Checks</h3>
        <ul className="mt-2 divide-y divide-border">
          {gateReport.checks.map((check) => (
            <li
              key={check.checkId}
              className="py-2.5"
              data-testid={`row-check-${check.checkId}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{check.label}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {check.blocking ? "blocking" : "advisory"} · {check.kind.replace(/_/g, " ")}
                  </span>
                  <CheckStatus status={check.status} />
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="label">Missing evidence</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {gateReport.missingEvidence.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="label">Not measured</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {gateReport.unmeasured.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

import type { ReactNode } from "react";
import clsx from "clsx";
import type { GateCheckStatus, GateVerdict, LicencePosture } from "@contracts";

/**
 * Small shared presentation pieces. Engineer 2 owns this file. Keep it small:
 * anything used once belongs in the component that uses it.
 */

export function Panel({
  title,
  subtitle,
  action,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="card min-w-0 p-5" data-testid={testId}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-1 break-words text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Logo({ className }: { className?: string }) {
  // A compiler mark: three inputs on the left resolving into one sequenced output.
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-label="Primer Compiler"
      role="img"
    >
      <circle cx="4" cy="5" r="1.6" />
      <circle cx="4" cy="12" r="1.6" />
      <circle cx="4" cy="19" r="1.6" />
      <path d="M5.6 5.6 11 11M5.6 12h5.4M5.6 18.4 11 13" />
      <circle cx="12.6" cy="12" r="1.8" />
      <path d="M14.4 12H20" />
      <path d="M17.6 9.4 20 12l-2.4 2.6" />
    </svg>
  );
}

const VERDICT_STYLES: Record<GateVerdict, string> = {
  RED: "border-error/40 bg-error/10 text-error",
  AMBER: "border-warning/40 bg-warning/10 text-warning",
  YELLOW: "border-warning/40 bg-warning/10 text-warning",
  BLUE: "border-primary/40 bg-primary/10 text-primary",
  GREEN: "border-success/40 bg-success/10 text-success",
};

export function VerdictBadge({ verdict }: { verdict: GateVerdict }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-xs font-medium uppercase",
        VERDICT_STYLES[verdict],
      )}
      data-testid={`status-verdict-${verdict}`}
    >
      <span aria-hidden="true">{verdict === "GREEN" || verdict === "BLUE" ? "✓" : "!"}</span>
      {verdict}
    </span>
  );
}

const STATUS_LABEL: Record<GateCheckStatus, string> = {
  pass: "pass",
  fail: "fail",
  abstain: "abstain",
  skipped: "not run",
};

const STATUS_STYLES: Record<GateCheckStatus, string> = {
  pass: "text-success",
  fail: "text-error",
  abstain: "text-warning",
  skipped: "text-muted-foreground",
};

export function CheckStatus({ status }: { status: GateCheckStatus }) {
  return (
    <span className={clsx("font-mono text-xs uppercase", STATUS_STYLES[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="chip">{children}</span>;
}

const POSTURE_STYLES: Record<LicencePosture, string> = {
  redistributable: "border-success/40 bg-success/10 text-success",
  cite_only: "border-warning/40 bg-warning/10 text-warning",
  unknown: "border-error/40 bg-error/10 text-error",
};

const POSTURE_LABEL: Record<LicencePosture, string> = {
  redistributable: "redistributable",
  cite_only: "cite only",
  unknown: "unknown licence",
};

export function LicenceBadge({
  posture,
  licenceId,
}: {
  posture: LicencePosture;
  licenceId: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex max-w-full flex-wrap items-center gap-1.5 break-words rounded-md border px-2 py-1 font-mono text-xs font-medium",
        POSTURE_STYLES[posture],
      )}
      data-testid={`badge-licence-${posture}`}
    >
      <span className="uppercase">{POSTURE_LABEL[posture]}</span>
      <span className="opacity-70">{licenceId}</span>
    </span>
  );
}

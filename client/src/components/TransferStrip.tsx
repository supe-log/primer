import clsx from "clsx";
import { transferCases, type TransferCaseId } from "@/lib/cases";

/**
 * Swaps artifact panes across frozen cases without re-running the pipeline.
 * A, B and C stay disabled until Engineer 1 drops schema-valid fixtures.
 */
export function TransferStrip({
  selected,
  hasLiveResult,
  onSelect,
}: {
  selected: TransferCaseId | null;
  hasLiveResult: boolean;
  onSelect: (id: TransferCaseId) => void;
}) {
  const cases = transferCases(hasLiveResult);

  return (
    <section className="mb-6" data-testid="panel-transfer">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Transfer strip</h2>
        <p className="text-xs text-muted-foreground">
          Same engine, one schema. Click a ready card to swap artifacts without compiling.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cases.map((entry) => {
          const active = selected === entry.id;
          return (
            <li key={entry.id} className="min-w-0">
              <button
                type="button"
                disabled={!entry.ready}
                onClick={() => onSelect(entry.id)}
                className={clsx(
                  "h-full w-full min-w-0 rounded-md border px-3 py-2 text-left text-sm",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:border-primary/40",
                  !entry.ready && "cursor-not-allowed opacity-60 hover:border-border",
                )}
                data-testid={`button-case-${entry.id}`}
              >
                <span className="font-mono text-xs uppercase tracking-wide">{entry.label}</span>
                <span className="mt-1 block break-words font-medium">{entry.jurisdiction}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{entry.note}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

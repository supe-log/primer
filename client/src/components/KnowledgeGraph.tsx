import { useMemo, useState } from "react";
import clsx from "clsx";
import type { GraphView } from "@/lib/views";
import { inspectNode, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from "@/lib/graphLayout";
import { Chip, Panel } from "./primitives";

/**
 * Clickable knowledge graph from GET /graph. Nodes show labels; the detail
 * pane shows the knowledge-component text and the official standard statement.
 */

function truncate(label: string, max = 28): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function KnowledgeGraph({
  graph,
  runId,
}: {
  graph: GraphView | null;
  runId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(() => (graph ? layoutGraph(graph) : null), [graph]);
  const inspection = graph && selectedId ? inspectNode(graph, selectedId) : undefined;
  const byId = useMemo(() => new Map(layout?.nodes.map((node) => [node.id, node]) ?? []), [layout]);

  return (
    <Panel
      title="Knowledge graph"
      subtitle={
        graph
          ? `${graph.stats.nodes} nodes · ${graph.stats.edges} edges · ${graph.stats.belowStage} below stage. Click a node to read the standard.`
          : runId
            ? "This run has no graph. A refused compile does not invent nodes."
            : "Compile a course to load the graph from the run."
      }
      testId="panel-graph"
    >
      {!graph || !layout ? (
        <p className="text-sm text-muted-foreground">
          The graph route reads a persisted compile. Nothing is drawn until a run exists.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="overflow-x-auto rounded-md border border-border bg-surface-alt">
            <svg
              role="img"
              aria-label="Prerequisite knowledge graph"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width="100%"
              height={Math.min(360, layout.height)}
              data-testid="svg-graph"
            >
              {graph.edges.map((edge) => {
                const from = byId.get(edge.from);
                const to = byId.get(edge.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_WIDTH;
                const y1 = from.cy;
                const x2 = to.x;
                const y2 = to.cy;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${edge.from}->${edge.to}`}
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    className="stroke-border"
                    strokeWidth="1.6"
                  />
                );
              })}
              {layout.nodes.map((laid) => {
                const selected = laid.id === selectedId;
                return (
                  <g
                    key={laid.id}
                    transform={`translate(${laid.x} ${laid.y})`}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => setSelectedId(laid.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(laid.id);
                      }
                    }}
                    data-testid={`node-${laid.id}`}
                    className="cursor-pointer"
                  >
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx="8"
                      className={clsx(
                        selected
                          ? "fill-primary/15 stroke-primary"
                          : laid.node.prerequisiteOnly
                            ? "fill-surface stroke-border"
                            : "fill-surface stroke-primary/40",
                      )}
                      strokeWidth="1.6"
                    />
                    <text
                      x={12}
                      y={22}
                      className="fill-foreground"
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {truncate(laid.node.label)}
                    </text>
                    <text x={12} y={38} className="fill-muted-foreground" style={{ fontSize: 10 }}>
                      {laid.node.prerequisiteOnly
                        ? "below stage"
                        : laid.node.atomicEntry
                          ? "atomic entry"
                          : `${laid.node.standardIds.length} standard${laid.node.standardIds.length === 1 ? "" : "s"}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div
            className="rounded-md border border-border bg-surface-alt p-4"
            data-testid="panel-node-detail"
          >
            {inspection ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {inspection.node.prerequisiteOnly ? <Chip>below stage</Chip> : null}
                  {inspection.node.atomicEntry ? <Chip>atomic entry</Chip> : null}
                  <Chip>{inspection.node.id}</Chip>
                </div>
                <h3 className="text-sm font-semibold" data-testid="text-node-label">
                  {inspection.node.label}
                </h3>
                <p className="text-sm" data-testid="text-node-description">
                  {inspection.node.description}
                </p>
                <div>
                  <h4 className="label">Standards</h4>
                  {inspection.standards.length === 0 ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Pulled in as a prerequisite. No requested standard maps here.
                    </p>
                  ) : (
                    <ul className="mt-1.5 space-y-2">
                      {inspection.standards.map((standard) => (
                        <li key={standard.standardId} data-testid={`text-standard-${standard.standardId}`}>
                          <p className="font-mono text-xs text-muted-foreground">{standard.sourceCode}</p>
                          <p className="text-sm">{standard.statement}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {inspection.incoming.length > 0 ? (
                  <div>
                    <h4 className="label">Requires</h4>
                    <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                      {inspection.incoming.map((edge) => (
                        <li key={`${edge.from}->${edge.to}`}>{edge.justification}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a node to read the knowledge component and its standard text.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

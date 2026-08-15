import type { CurriculumGraph, GateCheck, RefusalReport } from "@contracts";
import { findCycle, validateGraph } from "../validators/graph";

/**
 * Graph auditor: deterministic repair loop over a (possibly model-produced) graph.
 *
 * Agents propose a graph. This module decides whether it is sound. Two repair
 * passes maximum, then abstain with `graph_unsound` rather than sequencing a
 * broken graph. Repairs are mechanical and named; they never invent a prerequisite.
 */

export const MAX_GRAPH_REPAIR_PASSES = 2;

export interface GraphRevision {
  agentId: string;
  attempt: number;
  kept: boolean;
  reason: string;
}

export interface GraphAuditResult {
  /** Present only when the graph is sound enough to sequence. */
  graph?: CurriculumGraph;
  checks: GateCheck[];
  revisions: GraphRevision[];
  abstained: boolean;
  refusal?: RefusalReport;
}

function blockingGraphFailures(checks: GateCheck[]): GateCheck[] {
  return checks.filter((check) => check.blocking && check.status === "fail");
}

function dropEdges(
  graph: CurriculumGraph,
  predicate: (edge: CurriculumGraph["prerequisiteEdges"][number]) => boolean,
): CurriculumGraph {
  return {
    ...graph,
    prerequisiteEdges: graph.prerequisiteEdges.filter((edge) => !predicate(edge)),
  };
}

/**
 * One mechanical repair pass. Removes the first named defect; does not invent
 * edges or knowledge components. Returns the repaired graph and a human-readable
 * list of what changed.
 */
export function repairGraph(graph: CurriculumGraph): { graph: CurriculumGraph; repairs: string[] } {
  const repairs: string[] = [];
  let next = graph;
  const ids = new Set(next.knowledgeComponents.map((kc) => kc.knowledgeComponentId));

  const dangling = next.prerequisiteEdges.filter((edge) => !ids.has(edge.from) || !ids.has(edge.to));
  if (dangling.length > 0) {
    next = dropEdges(next, (edge) => !ids.has(edge.from) || !ids.has(edge.to));
    repairs.push(`Dropped ${dangling.length} dangling edges that did not resolve.`);
  }

  const unjustified = next.prerequisiteEdges.filter((edge) => edge.justification.trim() === "");
  if (unjustified.length > 0) {
    next = dropEdges(next, (edge) => edge.justification.trim() === "");
    repairs.push(`Dropped ${unjustified.length} edges with no justification.`);
  }

  const cycle = findCycle(next);
  if (!cycle.acyclic && cycle.cycle.length >= 2) {
    const from = cycle.cycle[cycle.cycle.length - 2]!;
    const to = cycle.cycle[cycle.cycle.length - 1]!;
    const before = next.prerequisiteEdges.length;
    next = dropEdges(next, (edge) => edge.from === from && edge.to === to);
    if (next.prerequisiteEdges.length < before) {
      repairs.push(`Broke cycle by removing ${from} → ${to}.`);
    }
  }

  const connected = new Set<string>();
  for (const edge of next.prerequisiteEdges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const orphans = next.knowledgeComponents.filter(
    (kc) => !connected.has(kc.knowledgeComponentId) && !kc.atomicEntry,
  );
  if (orphans.length > 0) {
    next = {
      ...next,
      knowledgeComponents: next.knowledgeComponents.map((kc) =>
        orphans.some((orphan) => orphan.knowledgeComponentId === kc.knowledgeComponentId)
          ? { ...kc, atomicEntry: true }
          : kc,
      ),
    };
    repairs.push(
      `Flagged ${orphans.length} orphans as atomic entry points: ${orphans
        .map((kc) => kc.knowledgeComponentId)
        .join(", ")}.`,
    );
  }

  const knownMisconceptions = new Set(next.misconceptions.map((item) => item.misconceptionId));
  const unresolved = next.knowledgeComponents.flatMap((kc) =>
    kc.misconceptionIds.filter((id) => !knownMisconceptions.has(id)),
  );
  if (unresolved.length > 0) {
    next = {
      ...next,
      knowledgeComponents: next.knowledgeComponents.map((kc) => ({
        ...kc,
        misconceptionIds: kc.misconceptionIds.filter((id) => knownMisconceptions.has(id)),
      })),
    };
    repairs.push(`Dropped ${unresolved.length} misconception links that did not resolve.`);
  }

  return { graph: next, repairs };
}

export function auditGraphWithRepair(
  graph: CurriculumGraph,
  maxPasses = MAX_GRAPH_REPAIR_PASSES,
): GraphAuditResult {
  const revisions: GraphRevision[] = [];
  let current = graph;
  let checks = validateGraph(current);

  if (blockingGraphFailures(checks).length === 0) {
    return { graph: current, checks, revisions, abstained: false };
  }

  for (let attempt = 1; attempt <= maxPasses; attempt += 1) {
    const { graph: repaired, repairs } = repairGraph(current);
    if (repairs.length === 0) break;
    current = repaired;
    checks = validateGraph(current);
    const failed = blockingGraphFailures(checks);
    const kept = failed.length === 0;
    revisions.push({
      agentId: "graph-auditor",
      attempt,
      kept,
      reason: kept
        ? `Repair pass ${attempt} produced a sound graph: ${repairs.join(" ")}`
        : `Repair pass ${attempt} was not enough: ${repairs.join(" ")} Remaining: ${failed
            .map((check) => check.checkId)
            .join(", ")}.`,
    });
    if (kept) {
      return { graph: current, checks, revisions, abstained: false };
    }
  }

  checks = validateGraph(current);
  const remaining = blockingGraphFailures(checks);
  return {
    checks,
    revisions,
    abstained: true,
    refusal: {
      code: "graph_unsound",
      requested: "A sequenced course over a sound prerequisite graph.",
      missingEvidence: [
        "A directed acyclic prerequisite graph with justified edges and no unresolved references",
        ...remaining.map((check) => check.detail),
      ],
      collectionPlan: [
        "Inspect the named cycle, dangling edge or orphan and repair the mapping by hand.",
        "Re-run the curriculum mapper with the auditor's revision notes, then the two-pass repair.",
        "If the graph is still unsound after two repairs, stop. Do not sequence a broken graph.",
      ],
    },
  };
}

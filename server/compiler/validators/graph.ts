import type { CurriculumGraph, GateCheck } from "@contracts";

/**
 * Deterministic graph validators. No model is involved, so these never fail
 * flakily, and they are what makes the demo trustworthy.
 */

export interface CycleResult {
  acyclic: boolean;
  /** One offending cycle as an ordered list of knowledge component ids, if any. */
  cycle: string[];
}

/** Depth-first cycle detection over prerequisite edges. Returns the first cycle found. */
export function findCycle(graph: CurriculumGraph): CycleResult {
  const adjacency = new Map<string, string[]>();
  for (const kc of graph.knowledgeComponents) {
    adjacency.set(kc.knowledgeComponentId, []);
  }
  for (const edge of graph.prerequisiteEdges) {
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
  }

  const state = new Map<string, "unvisited" | "open" | "closed">();
  for (const id of adjacency.keys()) state.set(id, "unvisited");
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    state.set(id, "open");
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const nextState = state.get(next);
      if (nextState === "open") {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (nextState === "unvisited") {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, "closed");
    return undefined;
  };

  for (const id of adjacency.keys()) {
    if (state.get(id) === "unvisited") {
      const cycle = visit(id);
      if (cycle) return { acyclic: false, cycle };
    }
  }
  return { acyclic: true, cycle: [] };
}

/** Topological order over prerequisite edges. Empty array when the graph has a cycle. */
export function topologicalOrder(graph: CurriculumGraph): string[] {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const kc of graph.knowledgeComponents) {
    indegree.set(kc.knowledgeComponentId, 0);
    adjacency.set(kc.knowledgeComponentId, []);
  }
  for (const edge of graph.prerequisiteEdges) {
    if (!indegree.has(edge.to) || !adjacency.has(edge.from)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    adjacency.get(edge.from)!.push(edge.to);
  }

  const ready = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
    ready.sort();
  }
  return order.length === graph.knowledgeComponents.length ? order : [];
}

export function validateGraph(graph: CurriculumGraph): GateCheck[] {
  const checks: GateCheck[] = [];
  const ids = new Set(graph.knowledgeComponents.map((kc) => kc.knowledgeComponentId));

  const cycleResult = findCycle(graph);
  checks.push({
    checkId: "check:graph.acyclic",
    label: "Prerequisite graph is a directed acyclic graph",
    kind: "deterministic",
    blocking: true,
    status: cycleResult.acyclic ? "pass" : "fail",
    detail: cycleResult.acyclic
      ? `${ids.size} knowledge components, ${graph.prerequisiteEdges.length} edges, no cycles.`
      : `Cycle found: ${cycleResult.cycle.join(" then ")}. Sequencing a cyclic graph is refused.`,
    counts: {
      nodes: ids.size,
      edges: graph.prerequisiteEdges.length,
      cycles: cycleResult.acyclic ? 0 : 1,
    },
  });

  const dangling = graph.prerequisiteEdges.filter(
    (edge) => !ids.has(edge.from) || !ids.has(edge.to),
  );
  checks.push({
    checkId: "check:graph.edges-resolve",
    label: "Every prerequisite edge references a known knowledge component",
    kind: "deterministic",
    blocking: true,
    status: dangling.length === 0 ? "pass" : "fail",
    detail:
      dangling.length === 0
        ? "All edge endpoints resolve into the graph."
        : `${dangling.length} edges point at a knowledge component that is not in the graph.`,
    counts: { edges: graph.prerequisiteEdges.length, dangling: dangling.length },
  });

  const unjustified = graph.prerequisiteEdges.filter((edge) => edge.justification.trim() === "");
  checks.push({
    checkId: "check:graph.edges-justified",
    label: "Every prerequisite edge carries a justification",
    kind: "deterministic",
    blocking: true,
    status: unjustified.length === 0 ? "pass" : "fail",
    detail:
      unjustified.length === 0
        ? `${graph.prerequisiteEdges.length} of ${graph.prerequisiteEdges.length} edges carry a justification.`
        : `${unjustified.length} edges have no justification.`,
    counts: { edges: graph.prerequisiteEdges.length, unjustified: unjustified.length },
  });

  const connected = new Set<string>();
  for (const edge of graph.prerequisiteEdges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  const orphans = graph.knowledgeComponents.filter(
    (kc) => !connected.has(kc.knowledgeComponentId) && !kc.atomicEntry,
  );
  checks.push({
    checkId: "check:graph.no-orphans",
    label: "No orphan knowledge components without an atomic-entry flag",
    kind: "deterministic",
    blocking: true,
    status: orphans.length === 0 ? "pass" : "fail",
    detail:
      orphans.length === 0
        ? "Every knowledge component is either connected or explicitly flagged as an entry point."
        : `${orphans.length} orphans: ${orphans.map((kc) => kc.knowledgeComponentId).join(", ")}.`,
    counts: { nodes: ids.size, orphans: orphans.length },
  });

  const knownMisconceptions = new Set(graph.misconceptions.map((m) => m.misconceptionId));
  const unknownLinks = graph.knowledgeComponents.flatMap((kc) =>
    kc.misconceptionIds.filter((id) => !knownMisconceptions.has(id)),
  );
  checks.push({
    checkId: "check:graph.misconceptions-resolve",
    label: "Every misconception link resolves to a declared misconception",
    kind: "deterministic",
    blocking: true,
    status: unknownLinks.length === 0 ? "pass" : "fail",
    detail:
      unknownLinks.length === 0
        ? `${knownMisconceptions.size} misconceptions declared and all links resolve.`
        : `${unknownLinks.length} links point at an undeclared misconception.`,
    counts: { declared: knownMisconceptions.size, unresolved: unknownLinks.length },
  });

  return checks;
}

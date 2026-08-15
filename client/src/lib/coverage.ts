import type { CompilationResult } from "@contracts";

/**
 * Coverage is computed from the artifacts, never asserted. Same arithmetic as
 * the compiler's check:coverage.standards, except assessed means a shipped item
 * (rejected items do not count as coverage).
 */
export function computeCoverage(result: CompilationResult) {
  const graph = result.graph;
  const requested = result.request.standardIds;
  const mapped = new Set(
    graph?.knowledgeComponents.flatMap((component) => component.standardIds) ?? [],
  );
  const assessed = new Set(
    result.items
      .filter((item) => !item.rejection)
      .flatMap((item) => item.standardIds),
  );
  const standards = new Map(
    (graph?.standards ?? []).map((standard) => [standard.standardId, standard]),
  );

  const rows = requested.map((standardId) => {
    const standard = standards.get(standardId);
    return {
      standardId,
      sourceCode: standard?.sourceCode ?? standardId,
      statement: standard?.statement ?? "",
      mapped: mapped.has(standardId),
      assessed: assessed.has(standardId),
    };
  });

  const covered = rows.filter((row) => row.mapped && row.assessed).length;
  const percent = requested.length === 0 ? 0 : Math.round((covered / requested.length) * 100);

  return { rows, covered, requested: requested.length, percent };
}

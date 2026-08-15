import type { CompilationResult, SourceManifest } from "@contracts";

/**
 * Source ids actually cited by the compiled artifacts. The snapshot store may
 * hold every fetched curriculum; a Year 7 run must not export Year 8 as if it
 * participated.
 */
export function referencedSourceIds(result: CompilationResult): Set<string> {
  const ids = new Set<string>();

  function take(sourceId: string | undefined) {
    if (sourceId) ids.add(sourceId);
  }

  for (const standard of result.graph?.standards ?? []) {
    for (const evidence of standard.evidence) take(evidence.sourceId);
  }
  for (const component of result.graph?.knowledgeComponents ?? []) {
    for (const evidence of component.evidence) take(evidence.sourceId);
  }
  for (const lesson of result.coursePlan?.lessons ?? []) {
    for (const decision of lesson.decisions) {
      for (const evidence of decision.evidence) take(evidence.sourceId);
    }
  }
  for (const item of result.items) {
    for (const evidence of item.evidence ?? []) take(evidence.sourceId);
  }

  return ids;
}

export function manifestForExport(result: CompilationResult): SourceManifest {
  const used = referencedSourceIds(result);
  if (used.size === 0) {
    return result.sourceManifest;
  }
  return {
    ...result.sourceManifest,
    sources: result.sourceManifest.sources.filter((source) => used.has(source.sourceId)),
  };
}

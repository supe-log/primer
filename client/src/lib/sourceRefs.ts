import type { CompilationResult, SourceSnapshot } from "@contracts";

/** Sources cited by the compiled artifacts, not every snapshot in the store. */
export function citedSources(result: CompilationResult): SourceSnapshot[] {
  const ids = new Set<string>();
  for (const standard of result.graph?.standards ?? []) {
    for (const evidence of standard.evidence) ids.add(evidence.sourceId);
  }
  for (const component of result.graph?.knowledgeComponents ?? []) {
    for (const evidence of component.evidence) ids.add(evidence.sourceId);
  }
  for (const lesson of result.coursePlan?.lessons ?? []) {
    for (const decision of lesson.decisions) {
      for (const evidence of decision.evidence) ids.add(evidence.sourceId);
    }
  }
  for (const item of result.items) {
    for (const evidence of item.evidence ?? []) ids.add(evidence.sourceId);
  }
  if (ids.size === 0) return result.sourceManifest.sources;
  return result.sourceManifest.sources.filter((source) => ids.has(source.sourceId));
}

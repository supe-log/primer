import type { CompilationRequest, Stage } from "@contracts";

/**
 * Jurisdiction adapters. Everything jurisdiction-specific sits behind this
 * interface, and the orchestrator depends only on the interface. Adding a country
 * means adding an adapter, never editing the orchestrator.
 *
 * Two adapters exist today, which is the minimum that makes the seam real: a live
 * one for Australia and a fixture one that replays a frozen precomputed case.
 *
 * Interface contract:
 *  - `resolveStage` must accept the jurisdiction's own stage label and return an
 *    internal ordinal plus a nominal age band. It must never key on a bare grade
 *    integer, because grade numbers do not survive a border crossing.
 *  - `blueprintAvailable` answers a licensing and evidence question, not a
 *    convenience one. When it returns false and the request asks for official exam
 *    emulation, the compiler refuses before generating anything.
 */
export interface JurisdictionAdapter {
  readonly jurisdictionId: string;
  readonly authorityName: string;
  readonly curriculumSourceId: string;
  /** Legal status of the published source, quoted from the authority where known. */
  readonly legalStatus: string;
  readonly subjects: readonly string[];
  resolveStage(localLabel: string): Stage | undefined;
  blueprintAvailable(request: CompilationRequest): boolean;
}

const AU_STAGES: Record<string, Stage> = {
  "Year 6": { localLabel: "Year 6", ageBand: [11, 12], ordinal: 7 },
  "Year 7": { localLabel: "Year 7", ageBand: [12, 13], ordinal: 8 },
  "Year 8": { localLabel: "Year 8", ageBand: [13, 14], ordinal: 9 },
};

/**
 * Australia, ACARA V9. Chosen as the live case because its curriculum material
 * carries an unambiguous Creative Commons Attribution 4.0 licence, which is what
 * makes a public demo recording safe.
 */
export const auAcaraAdapter: JurisdictionAdapter = {
  jurisdictionId: "au",
  authorityName: "Australian Curriculum, Assessment and Reporting Authority",
  curriculumSourceId: "acara.v9",
  legalStatus:
    "Curriculum material licensed CC BY 4.0 with named exclusions. Logos, trade marks, site design, third-party material and the National Literacy Learning Progressions are excluded.",
  subjects: ["Mathematics"],
  resolveStage: (localLabel) => AU_STAGES[localLabel],
  // No blueprint has been fetched for any Australian stage yet, so exam emulation refuses.
  blueprintAvailable: () => false,
};

/**
 * Fixture adapter for a precomputed transfer case. Engineer 1 registers one of
 * these per frozen case. It resolves stages by echoing whatever label the fixture
 * used, which is exactly the point: the schema does not care what a stage is called.
 */
export function createFixtureAdapter(config: {
  jurisdictionId: string;
  authorityName: string;
  curriculumSourceId: string;
  legalStatus: string;
  subjects: readonly string[];
  stages: Record<string, Stage>;
}): JurisdictionAdapter {
  return {
    jurisdictionId: config.jurisdictionId,
    authorityName: config.authorityName,
    curriculumSourceId: config.curriculumSourceId,
    legalStatus: config.legalStatus,
    subjects: config.subjects,
    resolveStage: (localLabel) => config.stages[localLabel],
    blueprintAvailable: () => false,
  };
}

const REGISTRY = new Map<string, JurisdictionAdapter>([
  [auAcaraAdapter.jurisdictionId, auAcaraAdapter],
]);

export function registerAdapter(adapter: JurisdictionAdapter): void {
  REGISTRY.set(adapter.jurisdictionId, adapter);
}

export function resolveAdapter(jurisdictionId: string): JurisdictionAdapter | undefined {
  return REGISTRY.get(jurisdictionId);
}

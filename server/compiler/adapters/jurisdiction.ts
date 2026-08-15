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
  /**
   * Snapshot ids this adapter reads, in manifest order. Every id must exist in the
   * snapshot store, so an adapter can never cite a source the run did not read.
   */
  readonly snapshotSourceIds: readonly string[];
  /**
   * The snapshot holding this jurisdiction's standards. Undefined means the adapter
   * has no fetched curriculum yet, and the compiler must not invent one.
   */
  readonly catalogueSourceId?: string;
  /**
   * Per-stage snapshots, keyed by the jurisdiction's own stage label. A curriculum
   * is published per level, so this is the normal case and `catalogueSourceId` is
   * the fallback for an adapter that fetched only one.
   */
  readonly catalogueSourceIdByStage?: Readonly<Record<string, string>>;
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
  // Year 7 Mathematics is the fetched level. The terms page carries the licence
  // itself, and the IES study is the cite-only evidence behind the interleaving
  // decision, so the manifest holds both licence postures the gate has to enforce.
  snapshotSourceIds: [
    "src:acara.v9.mathematics.year-7",
    "src:acara.v9.mathematics.year-8",
    "src:acara.v9.terms",
    "src:ies.interleaving-rct",
    "src:ies.organizing-instruction",
    "src:rosenshine.principles",
  ],
  catalogueSourceId: "src:acara.v9.mathematics.year-7",
  // Two fetched levels. Year 6 resolves as a stage so it can be pulled in as a
  // below-stage prerequisite, but it has no snapshot, so a request *for* Year 6
  // refuses rather than compiling against a curriculum nobody fetched.
  catalogueSourceIdByStage: {
    "Year 7": "src:acara.v9.mathematics.year-7",
    "Year 8": "src:acara.v9.mathematics.year-8",
  },
  resolveStage: (localLabel) => AU_STAGES[localLabel],
  // No blueprint has been fetched for any Australian stage yet, so exam emulation refuses.
  blueprintAvailable: () => false,
};

/**
 * The snapshot to read standards from for one request. Per-stage first, then the
 * adapter default. Undefined means this adapter has no fetched curriculum for that
 * stage, and the compiler refuses rather than compiling against nothing.
 */
export function catalogueSourceIdFor(
  adapter: JurisdictionAdapter,
  localLabel: string,
): string | undefined {
  // When an adapter declares per-stage snapshots, that map is exhaustive. Falling
  // back to the default would compile a Year 6 request against the Year 7
  // curriculum, which is a wrong answer dressed as a working one.
  if (adapter.catalogueSourceIdByStage) {
    return adapter.catalogueSourceIdByStage[localLabel];
  }
  return adapter.catalogueSourceId;
}

/**
 * Sources that belong to no jurisdiction: the pedagogical evidence the sequence
 * planner cites whatever curriculum is being compiled.
 *
 * An adapter with no curriculum snapshot still needs a manifest, because the
 * contract requires at least one source on every result including a refusal. These
 * are the honest answer to "what did this run have available", and crucially they
 * are not another country's curriculum. A refused Texas run that listed the
 * Australian Curriculum licence page made the citations panel read as though Texas
 * had been compiled from ACARA.
 */
export const JURISDICTION_NEUTRAL_SOURCE_IDS: readonly string[] = [
  "src:ies.interleaving-rct",
  "src:ies.organizing-instruction",
  "src:rosenshine.principles",
];

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
  snapshotSourceIds?: readonly string[];
  catalogueSourceId?: string;
}): JurisdictionAdapter {
  return {
    jurisdictionId: config.jurisdictionId,
    authorityName: config.authorityName,
    curriculumSourceId: config.curriculumSourceId,
    legalStatus: config.legalStatus,
    subjects: config.subjects,
    // A fixture adapter with no curriculum snapshot of its own falls back to the
    // jurisdiction-neutral pedagogy sources, never to another jurisdiction's
    // curriculum or licence page.
    snapshotSourceIds: config.snapshotSourceIds ?? JURISDICTION_NEUTRAL_SOURCE_IDS,
    catalogueSourceId: config.catalogueSourceId,
    resolveStage: (localLabel) => config.stages[localLabel],
    blueprintAvailable: () => false,
  };
}

/**
 * Transfer cases: jurisdictions whose stage ladder is registered and whose
 * curriculum has not been fetched.
 *
 * These exist to make a point that is easy to state and hard to fake. A different
 * stage ladder costs an adapter, not a schema change: Texas counts in grades, India
 * counts in a stage-and-class hybrid, and neither lines up with Year 7. The schema
 * does not care what a stage is called.
 *
 * What they deliberately do not do is compile. Each one refuses with a named
 * missing-evidence list and a collection plan, because the honest output for a
 * curriculum nobody has fetched is a refusal, not a bundle that looks the same as
 * the Australian one and is made up. A jurisdiction is "supported" when it has its
 * own hashed snapshot, its own verified licence and its own gate report.
 */
const US_TX_STAGES: Record<string, Stage> = {
  "Grade 4": { localLabel: "Grade 4", ageBand: [9, 10], ordinal: 5 },
  "Grade 5": { localLabel: "Grade 5", ageBand: [10, 11], ordinal: 6 },
  "Grade 6": { localLabel: "Grade 6", ageBand: [11, 12], ordinal: 7 },
};

const IN_NCERT_STAGES: Record<string, Stage> = {
  "Preparatory Stage, Class 3": {
    localLabel: "Preparatory Stage, Class 3",
    ageBand: [8, 9],
    ordinal: 4,
  },
  "Middle Stage, Class 6": { localLabel: "Middle Stage, Class 6", ageBand: [11, 12], ordinal: 7 },
  "Middle Stage, Class 7": { localLabel: "Middle Stage, Class 7", ageBand: [12, 13], ordinal: 8 },
};

export const usTexasAdapter: JurisdictionAdapter = {
  jurisdictionId: "us-tx",
  authorityName: "Texas Education Agency",
  curriculumSourceId: "teks.rla",
  legalStatus:
    "TEKS are published in the Texas Administrative Code. Redistribution terms are not verified here, and released STAAR items carry separate conditions, so the posture is cite and link until a human checks it.",
  subjects: ["Reading Language Arts"],
  snapshotSourceIds: JURISDICTION_NEUTRAL_SOURCE_IDS,
  // No fetched TEKS snapshot. The compiler refuses rather than inventing standards.
  catalogueSourceIdByStage: {},
  // Texas counts in grades, and a grade integer does not survive a border.
  resolveStage: (localLabel) => US_TX_STAGES[localLabel],
  blueprintAvailable: () => false,
};

export const inNcertAdapter: JurisdictionAdapter = {
  jurisdictionId: "in",
  authorityName: "National Council of Educational Research and Training",
  curriculumSourceId: "ncert.ncf",
  legalStatus:
    "NCERT learning outcomes are published for public use, but redistribution terms are unresolved. An unknown licence caps a run at prototype and blocks redistribution.",
  subjects: ["Mathematics"],
  snapshotSourceIds: JURISDICTION_NEUTRAL_SOURCE_IDS,
  catalogueSourceIdByStage: {},
  // A different ladder shape entirely: a named stage over several classes.
  resolveStage: (localLabel) => IN_NCERT_STAGES[localLabel],
  blueprintAvailable: () => false,
};

const REGISTRY = new Map<string, JurisdictionAdapter>([
  [auAcaraAdapter.jurisdictionId, auAcaraAdapter],
  [usTexasAdapter.jurisdictionId, usTexasAdapter],
  [inNcertAdapter.jurisdictionId, inNcertAdapter],
]);

export function registerAdapter(adapter: JurisdictionAdapter): void {
  REGISTRY.set(adapter.jurisdictionId, adapter);
}

export function resolveAdapter(jurisdictionId: string): JurisdictionAdapter | undefined {
  return REGISTRY.get(jurisdictionId);
}

/** Restores the three stock adapters after a test registered an ephemeral one. */
export function restoreStockAdapters(): void {
  REGISTRY.clear();
  REGISTRY.set(auAcaraAdapter.jurisdictionId, auAcaraAdapter);
  REGISTRY.set(usTexasAdapter.jurisdictionId, usTexasAdapter);
  REGISTRY.set(inNcertAdapter.jurisdictionId, inNcertAdapter);
}

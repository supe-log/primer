import { SourceSnapshot, type CompilationRequest, type Stage } from "@contracts";
import {
  JURISDICTION_NEUTRAL_SOURCE_IDS,
  registerAdapter,
  resolveAdapter,
  type JurisdictionAdapter,
} from "../adapters/jurisdiction";
import { classifyLicence } from "../licence/classify";
import type { ModelClient } from "../model/modelClient";
import type { StructuredModelRequest, StructuredSchema } from "../model/xaiModelClient";
import { ACARA_LICENCE, fetchAcaraSubject } from "../sources/acara";
import {
  catalogueFromCollectedStandards,
  catalogueFromSnapshot,
  putCollectedCatalogue,
  type CurriculumCatalogue,
} from "../sources/catalogue";
import { putOverlaySnapshot, sha256, spanMatches, type StoredSnapshot } from "../sources/snapshotStore";
import type { StageNote } from "../stages/modelBundle";
import { acaraLevelCode } from "./acaraLevel";
import { fetchExtractedPage } from "./fetchPage";

export const RESEARCHER_PROMPT_VERSION = "standards-researcher/2026-08-15.1";

export interface CollectDeps {
  modelClient: ModelClient;
  fetchImpl: typeof fetch;
  now: () => Date;
}

export interface CollectSuccess {
  ok: true;
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  notes: StageNote[];
}

export interface CollectFailure {
  ok: false;
  notes: StageNote[];
}

export type CollectResult = CollectSuccess | CollectFailure;

interface ProposedCandidate {
  code: string;
  statement: string;
}

interface ResearcherProposal {
  authorityName: string;
  canonicalUrl: string;
  curriculumUrl: string;
  licenceUrl: string;
  localStageLabel: string;
  ageBand: [number, number];
  licenceQuote: string;
  candidates: ProposedCandidate[];
}

const RESEARCHER_SCHEMA: StructuredSchema = {
  name: "standards_researcher_proposal",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "authorityName",
      "canonicalUrl",
      "curriculumUrl",
      "licenceUrl",
      "localStageLabel",
      "ageBand",
      "licenceQuote",
      "candidates",
    ],
    properties: {
      authorityName: { type: "string" },
      canonicalUrl: { type: "string" },
      curriculumUrl: { type: "string" },
      licenceUrl: { type: "string" },
      localStageLabel: { type: "string" },
      ageBand: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: { type: "integer" },
      },
      licenceQuote: { type: "string" },
      candidates: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["code", "statement"],
          properties: {
            code: { type: "string" },
            statement: { type: "string" },
          },
        },
      },
    },
  },
};

function note(
  phase: StageNote["phase"],
  message: string,
  counts?: Record<string, number>,
): StageNote {
  return { agentId: "agent:standards-researcher", phase, message, counts };
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectedSourceId(request: CompilationRequest): string {
  const slug = [
    "collected",
    request.jurisdictionId,
    slugPart(request.stage.localLabel),
    slugPart(request.subject),
  ]
    .join(".")
    .replace(/[^a-z0-9._-]+/g, "-");
  return `src:${slug}`;
}

function ordinalFromAgeBand(ageBand: [number, number]): number {
  return Math.max(0, ageBand[0] - 5);
}

function acceptedAgeBand(proposed: [number, number], fallback: [number, number]): [number, number] {
  const [low, high] = proposed;
  if (!Number.isInteger(low) || !Number.isInteger(high)) return fallback;
  if (low < 3 || high > 21 || low > high) return fallback;
  return [low, high];
}

function parseProposal(raw: unknown): ResearcherProposal {
  if (!raw || typeof raw !== "object") throw new Error("proposal is not an object");
  const value = raw as Record<string, unknown>;
  const ageBand = Array.isArray(value.ageBand) ? value.ageBand : [];
  const low = Number(ageBand[0]);
  const high = Number(ageBand[1]);
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  if (typeof value.authorityName !== "string" || value.authorityName.trim().length === 0) {
    throw new Error("authorityName missing");
  }
  if (typeof value.curriculumUrl !== "string") throw new Error("curriculumUrl missing");
  if (typeof value.licenceUrl !== "string") throw new Error("licenceUrl missing");
  if (typeof value.licenceQuote !== "string") throw new Error("licenceQuote missing");
  if (candidates.length === 0) throw new Error("no candidates");
  return {
    authorityName: value.authorityName.trim(),
    canonicalUrl: typeof value.canonicalUrl === "string" ? value.canonicalUrl : value.curriculumUrl,
    curriculumUrl: value.curriculumUrl,
    licenceUrl: value.licenceUrl,
    localStageLabel:
      typeof value.localStageLabel === "string" && value.localStageLabel.trim().length > 0
        ? value.localStageLabel.trim()
        : "unspecified",
    ageBand: [low, high],
    licenceQuote: value.licenceQuote,
    candidates: candidates.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      if (typeof row.code !== "string" || typeof row.statement !== "string") return [];
      if (row.code.trim().length === 0 || row.statement.trim().length < 8) return [];
      return [{ code: row.code.trim(), statement: row.statement.trim() }];
    }),
  };
}

function selectStandardIds(request: CompilationRequest, catalogue: CurriculumCatalogue): string[] {
  const known = new Set(catalogue.standards.map((standard) => standard.standardId));
  const intersection = request.standardIds.filter((id) => known.has(id));
  if (intersection.length > 0) return intersection;
  const take = Math.min(3, request.lessonCount, catalogue.standards.length);
  return catalogue.standards.slice(0, take).map((standard) => standard.standardId);
}

function storeSnapshot(input: {
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  body: string;
  licence: ReturnType<typeof classifyLicence>;
  retrievedAt: string;
}): StoredSnapshot {
  const stored: StoredSnapshot = {
    snapshot: SourceSnapshot.parse({
      sourceId: input.sourceId,
      title: input.title,
      publisher: input.publisher,
      url: input.url,
      retrievedAt: input.retrievedAt,
      contentSha256: sha256(input.body),
      fetched: true,
      licence: input.licence,
    }),
    body: input.body,
  };
  putOverlaySnapshot(stored);
  return stored;
}

function finishSuccess(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  catalogue: CurriculumCatalogue;
  notes: StageNote[];
  selectedMessage?: string;
}): CollectSuccess {
  const standardIds = selectStandardIds(input.request, input.catalogue);
  const selected =
    standardIds.join(",") === input.request.standardIds.join(",")
      ? input.request
      : { ...input.request, standardIds };
  const notes = [...input.notes];
  if (selected !== input.request) {
    notes.push(
      note(
        "agent_succeeded",
        input.selectedMessage ??
          `Requested ids were not in the fetched page; compiling the first ${standardIds.length} official descriptions found.`,
        { requested: input.request.standardIds.length, selected: standardIds.length },
      ),
    );
  }
  return { ok: true, request: selected, adapter: input.adapter, notes };
}

/**
 * ACARA already has a fetcher. When the stage and subject map to a level code,
 * skip the researcher and hash the official query bytes.
 */
export async function collectAcaraFastPath(
  request: CompilationRequest,
  deps: CollectDeps,
): Promise<CollectResult | undefined> {
  if (request.jurisdictionId !== "au") return undefined;
  const levelCode = acaraLevelCode(request.stage.localLabel, request.subject);
  if (!levelCode) return undefined;

  const notes: StageNote[] = [
    note(
      "agent_started",
      `Collecting ACARA V9 ${request.stage.localLabel} ${request.subject} via the official query API.`,
    ),
  ];

  try {
    const fetched = await fetchAcaraSubject({ levelCode }, deps.fetchImpl);
    const sourceId = `src:acara.v9.${slugPart(request.subject)}.${slugPart(request.stage.localLabel)}`;
    storeSnapshot({
      sourceId,
      title: `Australian Curriculum V9.0, ${request.subject}, ${request.stage.localLabel}`,
      publisher: "Australian Curriculum, Assessment and Reporting Authority",
      url: `https://v9.australiancurriculum.edu.au/f-10-curriculum/learning-areas/${slugPart(request.subject)}/${slugPart(request.stage.localLabel)}`,
      body: fetched.bytes,
      licence: ACARA_LICENCE,
      retrievedAt: deps.now().toISOString(),
    });
    const catalogue = catalogueFromSnapshot(sourceId);
    if (!catalogue || catalogue.standards.length === 0) {
      notes.push(
        note(
          "check_failed",
          `ACARA returned no content descriptions for ${levelCode}.`,
          { records: fetched.recordCount },
        ),
      );
      return { ok: false, notes };
    }

    const stock = resolveAdapter("au");
    const adapter: JurisdictionAdapter = {
      ...(stock ?? {
        jurisdictionId: "au",
        authorityName: "Australian Curriculum, Assessment and Reporting Authority",
        curriculumSourceId: "acara.v9",
        legalStatus: "Curriculum material licensed CC BY 4.0 with named exclusions.",
        subjects: [request.subject],
        snapshotSourceIds: [],
        resolveStage: () => undefined,
        blueprintAvailable: () => false,
      }),
      catalogueSourceId: stock?.catalogueSourceId,
      catalogueSourceIdByStage: {
        ...(stock?.catalogueSourceIdByStage ?? {}),
        [request.stage.localLabel]: sourceId,
      },
      snapshotSourceIds: Array.from(new Set([...(stock?.snapshotSourceIds ?? []), sourceId])),
      resolveStage: (localLabel) => stock?.resolveStage(localLabel),
      blueprintAvailable: () => false,
    };
    registerAdapter(adapter);
    notes.push(
      note(
        "agent_succeeded",
        `Fetched and hashed ${catalogue.standards.length} ACARA content descriptions for ${levelCode}.`,
        { standards: catalogue.standards.length },
      ),
    );
    notes.push({
      agentId: "agent:licence-gate",
      phase: "check_passed",
      message: "ACARA CC BY 4.0 licence applied from the known table, not from a model guess.",
    });
    return finishSuccess({ request, adapter, catalogue, notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(note("check_failed", `ACARA fetch failed: ${message.slice(0, 200)}.`));
    return { ok: false, notes };
  }
}

/**
 * Researcher proposes an official page; code fetches, hashes, classifies the
 * licence, and keeps only statements that appear verbatim in the body.
 */
export async function collectFromResearcher(
  request: CompilationRequest,
  deps: CollectDeps,
): Promise<CollectResult> {
  const notes: StageNote[] = [
    note(
      "agent_started",
      `No fetched snapshot for ${request.jurisdictionId} ${request.stage.localLabel} ${request.subject}. Researching an official source.`,
    ),
  ];

  const researchRequest: StructuredModelRequest<ResearcherProposal> = {
    role: "standards_researcher",
    promptVersion: RESEARCHER_PROMPT_VERSION,
    prompt: [
      "Name the official curriculum authority and the exact public HTTPS URL of the",
      `curriculum page for ${request.subject} at stage "${request.stage.localLabel}"`,
      `in jurisdiction "${request.jurisdictionId}" (${request.locale.bcp47}).`,
      "Also name the official licence or terms URL and quote a sentence from that page.",
      "List content descriptions as { code, statement } copied verbatim from the curriculum page.",
      "Do not invent a URL. Do not paraphrase a statement. Age band is two integers, not a grade number.",
    ].join(" "),
    parse: parseProposal,
    schema: RESEARCHER_SCHEMA,
    reasoningEffort: "low",
    timeoutMs: 25_000,
  };
  const response = await deps.modelClient.complete(researchRequest);

  if (!response.ok) {
    notes.push(
      note(
        "agent_abstained",
        `Researcher abstained: ${response.reason} No URL will be guessed.`,
      ),
    );
    return { ok: false, notes };
  }

  const proposal = response.value;
  notes.push(
    note(
      "agent_succeeded",
      `Researcher named ${proposal.authorityName} and ${proposal.candidates.length} candidate descriptions.`,
      { candidates: proposal.candidates.length },
    ),
  );

  let curriculum: { url: string; body: string };
  let licencePage: { url: string; body: string };
  try {
    curriculum = await fetchExtractedPage(proposal.curriculumUrl, deps.fetchImpl);
    licencePage =
      proposal.licenceUrl === proposal.curriculumUrl
        ? curriculum
        : await fetchExtractedPage(proposal.licenceUrl, deps.fetchImpl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(note("check_failed", `Fetch failed: ${message.slice(0, 220)}.`));
    return { ok: false, notes };
  }

  const licence = classifyLicence({
    pageText: licencePage.body,
    quote: proposal.licenceQuote,
    publisher: proposal.authorityName,
  });
  notes.push({
    agentId: "agent:licence-gate",
    phase: licence.posture === "unknown" ? "check_failed" : "check_passed",
    message:
      licence.posture === "unknown"
        ? "Licence quote did not appear on the fetched terms page. Posture is unknown and cite-only."
        : `Licence classified as ${licence.licenceId} (${licence.posture}) from the fetched terms page.`,
  });

  const accepted = proposal.candidates.filter((candidate) =>
    spanMatches(curriculum.body, candidate.statement),
  );
  notes.push(
    note(
      accepted.length > 0 ? "check_passed" : "check_failed",
      accepted.length > 0
        ? `${accepted.length} of ${proposal.candidates.length} candidate statements appear verbatim in the fetched page.`
        : `Fetched ${curriculum.url} but no candidate statement appeared in the page. Nothing will be compiled from invented wording.`,
      { proposed: proposal.candidates.length, accepted: accepted.length },
    ),
  );
  if (accepted.length === 0) {
    return { ok: false, notes };
  }

  const sourceId = collectedSourceId(request);
  storeSnapshot({
    sourceId,
    title: `${proposal.authorityName}, ${request.subject}, ${request.stage.localLabel}`,
    publisher: proposal.authorityName,
    url: curriculum.url,
    body: curriculum.body,
    licence,
    retrievedAt: deps.now().toISOString(),
  });

  const catalogue = catalogueFromCollectedStandards({
    sourceId,
    jurisdictionId: request.jurisdictionId,
    standards: accepted,
  });
  putCollectedCatalogue(catalogue);

  const ageBand = acceptedAgeBand(proposal.ageBand, request.stage.ageBand);
  const stage: Stage = {
    localLabel: request.stage.localLabel,
    ageBand,
    ordinal: ordinalFromAgeBand(ageBand),
  };
  const existing = resolveAdapter(request.jurisdictionId);
  const adapter: JurisdictionAdapter = {
    jurisdictionId: request.jurisdictionId,
    authorityName: proposal.authorityName,
    curriculumSourceId: existing?.curriculumSourceId ?? request.curriculumSourceId,
    legalStatus: existing?.legalStatus ?? `${proposal.authorityName}. Licence classified from a fetched terms page.`,
    subjects: existing?.subjects.includes(request.subject)
      ? existing.subjects
      : [...(existing?.subjects ?? []), request.subject],
    snapshotSourceIds: Array.from(new Set([sourceId, ...JURISDICTION_NEUTRAL_SOURCE_IDS])),
    catalogueSourceId: sourceId,
    catalogueSourceIdByStage: {
      ...(existing?.catalogueSourceIdByStage ?? {}),
      [request.stage.localLabel]: sourceId,
    },
    resolveStage: (localLabel) => {
      if (localLabel === request.stage.localLabel) return stage;
      return existing?.resolveStage(localLabel);
    },
    blueprintAvailable: () => false,
  };
  registerAdapter(adapter);

  return finishSuccess({ request, adapter, catalogue, notes });
}

export async function collectEvidence(
  request: CompilationRequest,
  deps: CollectDeps,
): Promise<CollectResult> {
  const acara = await collectAcaraFastPath(request, deps);
  if (acara) return acara;
  return collectFromResearcher(request, deps);
}

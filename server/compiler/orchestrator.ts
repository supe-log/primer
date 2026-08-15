import {
  CompilationResult,
  type AgentEvent,
  type AgentPhase,
  type CompilationRequest,
  type CompilationResult as CompilationResultType,
  type GateCheck,
  type RefusalReport,
  type RunManifest,
  type SourceManifest,
} from "@contracts";
import { resolveAdapter } from "./adapters/jurisdiction";
import { buildGateReport } from "./evidenceGate";
import { evaluateLicenceGate } from "./licence/gate";
import { MockModelClient, type ModelClient } from "./model/modelClient";
import { buildFallbackBundle } from "./stages/fallbackBundle";
import { allSnapshotsManifest, buildSourceManifest } from "./sources/catalogue";
import {
  validateCoursePlan,
  validateCoverage,
  validateGraph,
  validateItems,
  validatePrivacy,
  validateSources,
} from "./validators";

/**
 * Orchestrator: the implementation behind the Compiler interface.
 *
 * The scaffold runs the deterministic half of the pipeline for real (adapters,
 * validators, gate arithmetic, refusal routing) and replays frozen sample
 * artifacts where a model would otherwise generate. Engineer 1 replaces the
 * replay with real agent stages one at a time; every stage keeps the same
 * artifact contracts, so the client never changes.
 */

export const COMPILER_VERSION = "primer-compiler-0.1.1";

export interface OrchestratorDeps {
  modelClient: ModelClient;
  /** Injected so tests and replays produce identical timestamps. */
  now: () => Date;
}

export function defaultDeps(): OrchestratorDeps {
  const fixedStart = new Date("2026-08-15T14:00:00.000Z");
  let tick = 0;
  return {
    modelClient: new MockModelClient(),
    now: () => new Date(fixedStart.getTime() + tick++ * 250),
  };
}

interface EventSink {
  emit(input: {
    agentId: string;
    phase: AgentPhase;
    message: string;
    counts?: Record<string, number>;
    attempt?: number;
  }): void;
}

function createEventSink(runId: string, now: () => Date, out: AgentEvent[]): EventSink {
  let seq = 0;
  return {
    emit({ agentId, phase, message, counts = {}, attempt = 1 }) {
      out.push({
        schemaVersion: "0.1.0",
        runId,
        seq: seq++,
        at: now().toISOString(),
        agentId,
        phase,
        message,
        counts,
        attempt,
      });
    },
  };
}

function nextRunId(requestId: string, sequence: number): string {
  const slug = requestId.replace(/^req:/, "");
  return `run:${slug}.${String(sequence).padStart(4, "0")}`;
}

function buildRunManifest(input: {
  runId: string;
  request: CompilationRequest;
  modelClient: ModelClient;
  now: () => Date;
  startedAt: string;
  sourceManifest: SourceManifest;
  abstainedRoles: string[];
  revisions: RunManifest["revisions"];
}): RunManifest {
  return {
    schemaVersion: "0.1.0",
    runId: input.runId,
    requestId: input.request.requestId,
    startedAt: input.startedAt,
    finishedAt: input.now().toISOString(),
    compilerVersion: COMPILER_VERSION,
    modelClient: input.modelClient.name,
    modelCalls: input.abstainedRoles.map((role) => ({
      agentId: role,
      model: input.modelClient.name === "mock" ? "mock-deterministic" : "grok-4.6",
      promptVersion: "none",
      abstained: true,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    })),
    sourceDigests: input.sourceManifest.sources.map((source) => source.contentSha256),
    revisions: input.revisions,
    replayable: input.modelClient.name === "mock",
  };
}

function refuse(input: {
  runId: string;
  request: CompilationRequest;
  sourceManifest: SourceManifest;
  checks: GateCheck[];
  refusal: RefusalReport;
  summary: string;
  runManifest: RunManifest;
}): CompilationResultType {
  return CompilationResult.parse({
    schemaVersion: "0.1.0",
    runId: input.runId,
    status: "refused",
    request: input.request,
    sourceManifest: input.sourceManifest,
    items: [],
    gateReport: buildGateReport({
      checks: input.checks,
      missingEvidence: input.refusal.missingEvidence,
      unmeasured: ["blueprint conformance", "item difficulty calibration", "learner outcomes"],
      needsHumanReview: [],
      summary: input.summary,
    }),
    runManifest: input.runManifest,
    refusal: input.refusal,
    approvedByHuman: false,
  });
}

export interface RunRecord {
  result: CompilationResultType;
  events: AgentEvent[];
}

/**
 * Runs one compile. Returns the result and the event list together so the caller
 * can store both atomically. Pure with respect to its inputs: the same request and
 * the same deps produce the same bytes.
 */
/**
 * The run's source manifest, built from hashed snapshots rather than from a fixture.
 * A request whose jurisdiction has no adapter still gets a manifest — of everything
 * the compiler holds — because a refusal is a record of what was available, and
 * observing is always allowed even when compiling is not.
 */
function manifestForRequest(request: CompilationRequest): SourceManifest {
  const adapter = resolveAdapter(request.jurisdictionId);
  return adapter ? buildSourceManifest(adapter.snapshotSourceIds) : allSnapshotsManifest();
}

export function runCompile(
  request: CompilationRequest,
  deps: OrchestratorDeps,
  sequence: number,
): RunRecord {
  const runId = nextRunId(request.requestId, sequence);
  const events: AgentEvent[] = [];
  const sink = createEventSink(runId, deps.now, events);
  const startedAt = deps.now().toISOString();
  const sourceManifest = manifestForRequest(request);

  sink.emit({
    agentId: "agent:orchestrator",
    phase: "run_started",
    message: `Compiling ${request.subject}, ${request.stage.localLabel}, ${request.standardIds.length} standards, ${request.lessonCount} lessons.`,
    counts: { standards: request.standardIds.length, lessons: request.lessonCount },
  });

  const privacyCheck = validatePrivacy(request);
  sink.emit({
    agentId: "agent:privacy-scan",
    phase: privacyCheck.status === "pass" ? "check_passed" : "check_failed",
    message: privacyCheck.detail,
    counts: privacyCheck.counts,
  });

  const adapter = resolveAdapter(request.jurisdictionId);
  const stage = adapter?.resolveStage(request.stage.localLabel);

  if (!adapter || !stage) {
    sink.emit({
      agentId: "agent:locale-resolver",
      phase: "run_refused",
      message: `No adapter resolves jurisdiction "${request.jurisdictionId}" at stage "${request.stage.localLabel}". Nothing is generated speculatively.`,
    });
    const checks: GateCheck[] = [
      privacyCheck,
      {
        checkId: "check:request.schema-valid",
        label: "Request resolves against a registered adapter",
        kind: "deterministic",
        blocking: true,
        status: "fail",
        detail: `No adapter for jurisdiction "${request.jurisdictionId}" and stage "${request.stage.localLabel}".`,
        counts: {},
      },
    ];
    return {
      result: refuse({
        runId,
        request,
        sourceManifest,
        checks,
        summary: "Refused. The requested jurisdiction and stage have no registered adapter.",
        runManifest: buildRunManifest({
          runId,
          request,
          modelClient: deps.modelClient,
          now: deps.now,
          startedAt,
          sourceManifest,
          abstainedRoles: [],
          revisions: [],
        }),
        refusal: {
          code: "unresolved_adapter",
          requested: `${request.subject} for ${request.stage.localLabel} in jurisdiction ${request.jurisdictionId}`,
          missingEvidence: [
            `A jurisdiction adapter for "${request.jurisdictionId}"`,
            `A stage mapping for "${request.stage.localLabel}" with an age band and an internal ordinal`,
          ],
          collectionPlan: [
            "Add an adapter in server/compiler/adapters that names the authority, its legal status and its stage ladder.",
            "Record the source licence for that jurisdiction before compiling anything from it.",
          ],
        },
      }),
      events,
    };
  }

  sink.emit({
    agentId: "agent:locale-resolver",
    phase: "agent_succeeded",
    message: `Resolved ${stage.localLabel} to internal ordinal ${stage.ordinal}, ages ${stage.ageBand[0]} to ${stage.ageBand[1]}, ${request.locale.bcp47}, ${request.locale.script} script.`,
  });

  const sourceChecks = [...validateSources(sourceManifest), ...evaluateLicenceGate(sourceManifest)];
  for (const check of sourceChecks) {
    sink.emit({
      agentId: "agent:licence-gate",
      phase: check.status === "pass" ? "check_passed" : "check_failed",
      message: check.detail,
      counts: check.counts,
    });
  }

  if (request.assessmentTarget === "official_exam_emulation" && !adapter.blueprintAvailable(request)) {
    sink.emit({
      agentId: "agent:release-gate",
      phase: "run_refused",
      message:
        "Official exam emulation was requested and no blueprint has been fetched. Refused before generating any content.",
    });
    const checks: GateCheck[] = [
      privacyCheck,
      ...sourceChecks,
      {
        checkId: "check:blueprint.present",
        label: "Official exam emulation requires a fetched blueprint",
        kind: "deterministic",
        blocking: true,
        status: "fail",
        detail: `No blueprint is available for ${adapter.jurisdictionId} ${stage.localLabel} ${request.subject}. Refused before generating any content.`,
        counts: { blueprintsFound: 0 },
      },
    ];
    return {
      result: refuse({
        runId,
        request,
        sourceManifest,
        checks,
        summary:
          "Refused. Emulating an official exam without its blueprint would be a validity claim this run has not earned.",
        runManifest: buildRunManifest({
          runId,
          request,
          modelClient: deps.modelClient,
          now: deps.now,
          startedAt,
          sourceManifest,
          abstainedRoles: [],
          revisions: [],
        }),
        refusal: {
          code: "missing_blueprint",
          requested: `A ${stage.localLabel} ${request.subject} unit whose practice items emulate the official exam.`,
          missingEvidence: [
            "The official blueprint for this jurisdiction, stage and subject, fetched and content-hashed",
            "Released items with published keys and rationales to check tag agreement against",
          ],
          collectionPlan: [
            "Fetch the jurisdiction's published blueprint and record its URL, retrieval time, digest and licence.",
            "Fetch a released form with its answer key and item rationales, keeping it local if the licence forbids redistribution.",
            "Re-run with assessment target set to unit test to get a formative bundle now, then upgrade once the blueprint is in the snapshot store.",
          ],
        },
      }),
      events,
    };
  }

  // Deterministic construction path. The model client can replace the mapper and
  // item writer later; this fallback is what MockModelClient and the stage path use.
  const bundle = buildFallbackBundle({ request, adapter, sourceManifest });

  if (bundle.refusal || !bundle.graph || !bundle.coursePlan) {
    sink.emit({
      agentId: "agent:graph-auditor",
      phase: "run_refused",
      message:
        bundle.refusal?.missingEvidence[0] ??
        "Graph unsound after two repair passes. Nothing is sequenced.",
    });
    return {
      result: refuse({
        runId,
        request,
        sourceManifest,
        checks: [privacyCheck, ...sourceChecks],
        summary: "Refused. The prerequisite graph was still unsound after two repair passes.",
        runManifest: buildRunManifest({
          runId,
          request,
          modelClient: deps.modelClient,
          now: deps.now,
          startedAt,
          sourceManifest,
          abstainedRoles: ["curriculum-mapper"],
          revisions: bundle.revisions,
        }),
        refusal: bundle.refusal ?? {
          code: "graph_unsound",
          requested: `${request.subject} for ${request.stage.localLabel}`,
          missingEvidence: ["A sound prerequisite graph"],
          collectionPlan: ["Repair the mapping by hand and re-run."],
        },
      }),
      events,
    };
  }

  const graph = bundle.graph;
  const coursePlan = bundle.coursePlan;
  const items = bundle.items;

  sink.emit({
    agentId: "agent:curriculum-mapper",
    phase: "agent_succeeded",
    message: `Emitted ${graph.knowledgeComponents.length} knowledge components and ${graph.prerequisiteEdges.length} prerequisite edges from the deterministic fallback map.`,
    counts: {
      nodes: graph.knowledgeComponents.length,
      edges: graph.prerequisiteEdges.length,
      belowStage: graph.knowledgeComponents.filter((kc) => kc.prerequisiteOnly).length,
    },
  });

  for (const revision of bundle.revisions) {
    sink.emit({
      agentId: "agent:graph-auditor",
      phase: revision.kept ? "check_passed" : "revision_started",
      message: revision.reason,
      attempt: revision.attempt,
    });
  }

  const graphChecks = validateGraph(graph);
  for (const check of graphChecks) {
    sink.emit({
      agentId: "agent:graph-auditor",
      phase: check.status === "pass" ? "check_passed" : "check_failed",
      message: check.detail,
      counts: check.counts,
    });
  }

  const planChecks = validateCoursePlan(coursePlan, graph);
  for (const check of planChecks) {
    sink.emit({
      agentId: "agent:sequence-planner",
      phase: check.status === "pass" ? "check_passed" : "check_failed",
      message: check.detail,
      counts: check.counts,
    });
  }

  const itemChecks = validateItems(items, graph);
  for (const check of itemChecks) {
    sink.emit({
      agentId: "agent:assessment-validator",
      phase: check.status === "pass" ? "check_passed" : "check_failed",
      message: check.detail,
      counts: check.counts,
    });
  }

  const coverageCheck = validateCoverage(request, graph, items);
  sink.emit({
    agentId: "agent:standards-auditor",
    phase: coverageCheck.status === "pass" ? "check_passed" : "check_failed",
    message: coverageCheck.detail,
    counts: coverageCheck.counts,
  });

  const criticCheck: GateCheck = {
    checkId: "check:critic.learning-science",
    label: "Learning-science critic screen",
    kind: "model_critic",
    blocking: false,
    status: "abstain",
    detail:
      deps.modelClient.name === "mock"
        ? "No model client configured, so the critic abstained. The gate records an abstention, never a pass."
        : "Critic did not return a usable verdict, so it abstained.",
    counts: {},
  };
  sink.emit({
    agentId: "agent:learning-science-critic",
    phase: "agent_abstained",
    message: criticCheck.detail,
  });

  const checks: GateCheck[] = [
    {
      checkId: "check:contract.schema-valid",
      label: "Every artifact parses against contracts 0.1.0",
      kind: "deterministic",
      blocking: true,
      status: "pass",
      detail: "Request, graph, course plan, items, gate report and run manifest all parsed.",
      counts: { artifacts: 6 },
    },
    privacyCheck,
    ...sourceChecks,
    ...graphChecks,
    ...planChecks,
    ...itemChecks,
    coverageCheck,
    criticCheck,
    {
      checkId: "check:expert.item-review",
      label: "Expert review of item construct fit",
      kind: "expert_review",
      blocking: false,
      status: "skipped",
      detail: "No expert review has been run on this bundle.",
      counts: {},
    },
    {
      checkId: "check:pilot.item-statistics",
      label: "Pilot item statistics and differential item functioning",
      kind: "pilot_measurement",
      blocking: false,
      status: "skipped",
      detail:
        "No response data exists. Every item is labelled uncalibrated with differential item functioning not yet measured.",
      counts: {},
    },
  ];

  const rejectedItems = items.filter((item) => item.rejection);
  const gateReport = buildGateReport({
    checks,
    missingEvidence: [
      "Fetched and content-hashed curriculum content descriptions with their official codes",
      "A learning-science critic run against a configured model client",
      "Expert review verdicts on the item bank",
      "Pilot response data for item calibration and differential item functioning",
    ],
    unmeasured: [
      "learner outcomes",
      "item difficulty calibration",
      "differential item functioning",
      "expert accept rate",
    ],
    needsHumanReview: [
      ...rejectedItems.map((item) => item.itemId),
      ...graph.standards.map((standard) => standard.standardId),
    ],
    summary:
      "Prototype bundle built from sample standards. Structure, coverage and item rules check out. Nothing here has earned a claim about learning, difficulty or fairness.",
  });

  sink.emit({
    agentId: "agent:release-gate",
    phase: "gate_evaluated",
    message: `Verdict ${gateReport.verdict} at permission tier ${gateReport.permission}. ${items.length - rejectedItems.length} items ship, ${rejectedItems.length} rejected, ${gateReport.missingEvidence.length} evidence items missing.`,
    counts: {
      shipped: items.length - rejectedItems.length,
      rejected: rejectedItems.length,
      missingEvidence: gateReport.missingEvidence.length,
    },
  });

  const status = gateReport.verdict === "YELLOW" ? "draft" : "published";

  const result = CompilationResult.parse({
    schemaVersion: "0.1.0",
    runId,
    status,
    request,
    sourceManifest,
    graph,
    coursePlan,
    items,
    gateReport,
    runManifest: buildRunManifest({
      runId,
      request,
      modelClient: deps.modelClient,
      now: deps.now,
      startedAt,
      sourceManifest,
      abstainedRoles: ["learning-science-critic"],
      revisions: [
        ...bundle.revisions,
        ...rejectedItems.map((item) => ({
          agentId: "item-writer",
          attempt: 1,
          kept: false,
          reason: item.rejection?.reason ?? "rejected by a deterministic validator",
        })),
      ],
    }),
    approvedByHuman: false,
  });

  sink.emit({
    agentId: "agent:orchestrator",
    phase: "run_completed",
    message:
      status === "draft"
        ? "Draft bundle ready for human review. Nothing publishes without an explicit human approval outside this code."
        : "Bundle ready, still pending explicit human approval. There is no auto-publish path in the code.",
  });

  return { result, events };
}

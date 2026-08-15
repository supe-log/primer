import type {
  AgentPhase,
  CompilationRequest,
  ModelCallRecord,
  SourceManifest,
} from "@contracts";
import { catalogueSourceIdFor, type JurisdictionAdapter } from "../adapters/jurisdiction";
import type { ModelClient } from "../model/modelClient";
import { catalogueFromSnapshot } from "../sources/catalogue";
import { buildFallbackBundle, type FallbackBundle } from "./fallbackBundle";
import { mapCurriculumWithModel } from "./curriculumMapper";
import { writeItemsWithModel } from "./itemWriter";
import { auditGraphWithRepair } from "./graphAuditor";
import { planSequence } from "./sequencePlanner";
import { writeFallbackItems } from "./fallbackItems";

/**
 * Composes the real agent stages with the deterministic ones.
 *
 * The pipeline is the same either way — map, audit with a two-pass repair, sequence,
 * write items, validate — and only the mapper and item writer change hands. Every
 * stage falls back rather than fails: an abstaining mapper hands over to the
 * deterministic map, an abstaining item writer hands over to the deterministic bank,
 * and a graph that is still unsound after two repair passes refuses instead of being
 * sequenced. That is why a missing key, a rate limit and a bad night on the network
 * all produce a bundle with an honest gate report rather than a broken demo.
 *
 * This function does no I/O of its own and emits no events. It returns the artifacts
 * plus a narration the orchestrator replays into the event stream, so the event
 * sequence stays the orchestrator's single responsibility.
 */

export interface StageNote {
  agentId: string;
  phase: AgentPhase;
  message: string;
  counts?: Record<string, number>;
  attempt?: number;
}

export interface ModelBundle extends FallbackBundle {
  /** Every model call the run made, abstentions included. */
  modelCalls: ModelCallRecord[];
  /** Narration for the pipeline panel, in order. */
  notes: StageNote[];
  /** True when a model produced the graph. False means the deterministic map ran. */
  graphFromModel: boolean;
  /** True when a model produced the items. */
  itemsFromModel: boolean;
}

export async function buildModelBundle(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  sourceManifest: SourceManifest;
  modelClient: ModelClient;
}): Promise<ModelBundle> {
  const { request, adapter, sourceManifest, modelClient } = input;
  const notes: StageNote[] = [];
  const modelCalls: ModelCallRecord[] = [];

  const catalogueSourceId = catalogueSourceIdFor(adapter, request.stage.localLabel);
  const catalogue = catalogueSourceId ? catalogueFromSnapshot(catalogueSourceId) : undefined;

  // Stage 2, graph construction.
  let graph = undefined as ModelBundle["graph"];
  let graphFromModel = false;

  if (catalogue) {
    const mapped = await mapCurriculumWithModel({
      request,
      adapter,
      sourceManifest,
      catalogue,
      modelClient,
    });
    modelCalls.push(mapped.call);
    notes.push({
      agentId: "agent:curriculum-mapper",
      phase: mapped.abstained ? "agent_abstained" : "agent_succeeded",
      message: mapped.reason,
      counts: mapped.counts,
    });
    if (mapped.graph) {
      graph = mapped.graph;
      graphFromModel = true;
    }
  } else {
    notes.push({
      agentId: "agent:curriculum-mapper",
      phase: "agent_abstained",
      message:
        "No fetched curriculum snapshot is registered for this jurisdiction, so the mapper was not run. The deterministic map runs instead.",
    });
  }

  if (!graph) {
    // Deterministic path end to end. Its own auditor and refusal handling apply.
    const fallback = buildFallbackBundle({ request, adapter, sourceManifest });
    return {
      ...fallback,
      modelCalls,
      notes,
      graphFromModel: false,
      itemsFromModel: false,
    };
  }

  // The auditor is the same code that audits the deterministic map. A model-produced
  // graph earns no leniency, and gets two repair passes before it is abandoned.
  const audited = auditGraphWithRepair(graph);
  for (const revision of audited.revisions) {
    notes.push({
      agentId: "agent:graph-auditor",
      phase: revision.kept ? "check_passed" : "revision_started",
      message: revision.reason,
      attempt: revision.attempt,
    });
  }

  if (audited.abstained || !audited.graph) {
    notes.push({
      agentId: "agent:graph-auditor",
      phase: "run_refused",
      message:
        "The model's prerequisite graph was still unsound after two repair passes. Nothing is sequenced.",
    });
    return {
      items: [],
      revisions: audited.revisions,
      refusal: audited.refusal,
      modelCalls,
      notes,
      graphFromModel: true,
      itemsFromModel: false,
    };
  }

  const auditedGraph = audited.graph;

  // Stage 3, scope and sequence. Arithmetic over the graph, so it stays in code.
  const coursePlan = planSequence({
    graph: auditedGraph,
    request,
    sourceManifest,
  });

  // Stage 4, items.
  const written = await writeItemsWithModel({
    request,
    graph: auditedGraph,
    coursePlan,
    modelClient,
  });
  modelCalls.push(written.call);
  notes.push({
    agentId: "agent:item-writer",
    phase: written.abstained ? "agent_abstained" : "agent_succeeded",
    message: written.reason,
    counts: written.counts,
  });

  let items = written.items;
  let itemsFromModel = !written.abstained;
  if (items.length === 0) {
    items = writeFallbackItems({ graph: auditedGraph, request, coursePlan });
    itemsFromModel = false;
  } else {
    // Lessons carry the item ids for the components they introduce, whichever writer
    // produced them.
    const byComponent = new Map<string, string[]>();
    for (const item of items) {
      for (const componentId of item.knowledgeComponentIds) {
        const list = byComponent.get(componentId) ?? [];
        list.push(item.itemId);
        byComponent.set(componentId, list);
      }
    }
    for (const lesson of coursePlan.lessons) {
      lesson.itemIds = lesson.introducesKnowledgeComponentIds.flatMap(
        (componentId) => byComponent.get(componentId) ?? [],
      );
    }
  }

  return {
    graph: auditedGraph,
    coursePlan,
    items,
    revisions: audited.revisions,
    modelCalls,
    notes,
    graphFromModel,
    itemsFromModel,
  };
}

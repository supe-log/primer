import {
  AgentEvent,
  CompilationRequest,
  CompilationResult,
  type AgentEvent as AgentEventType,
  type CompilationRequest as CompilationRequestType,
  type CompilationResult as CompilationResultType,
} from "@contracts";
import draftJson from "../fixtures/compilation-result.json";
import refusalJson from "../fixtures/refusal-result.json";
import eventsJson from "../fixtures/agent-events.json";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * Frozen cases the interface can render without the compiler. Copies live under
 * client/src/fixtures so Vite's client root can import them. A, B and C stay
 * disabled until Engineer 1 drops schema-valid files at case-a.json and friends.
 */
export const frozenDraft: CompilationResultType = CompilationResult.parse(draftJson);
export const frozenRefusal: CompilationResultType = CompilationResult.parse(refusalJson);
export const frozenEvents: AgentEventType[] = AgentEvent.array().parse(eventsJson);
export const frozenDemoRequest: CompilationRequestType = CompilationRequest.parse(demoRequestJson);

export type TransferCaseId = "d-live" | "d-frozen" | "refusal" | "a" | "b" | "c";

export interface TransferCase {
  id: TransferCaseId;
  label: string;
  jurisdiction: string;
  note: string;
  ready: boolean;
  result?: CompilationResultType;
  events?: AgentEventType[];
}

const extraCases = import.meta.glob("../fixtures/case-*.json", { eager: true });

function extraResult(id: "a" | "b" | "c"): CompilationResultType | undefined {
  const match = Object.entries(extraCases).find(([path]) => path.includes(`case-${id}.json`));
  if (!match) {
    return undefined;
  }
  const parsed = CompilationResult.safeParse((match[1] as { default?: unknown }).default ?? match[1]);
  return parsed.success ? parsed.data : undefined;
}

export function transferCases(hasLiveResult: boolean): TransferCase[] {
  const caseA = extraResult("a");
  const caseB = extraResult("b");
  const caseC = extraResult("c");

  return [
    {
      id: "d-live",
      label: "D live",
      jurisdiction: "Australia · Year 7 maths",
      note: hasLiveResult ? "This compile" : "Compile the form to fill this card",
      ready: hasLiveResult,
    },
    {
      id: "d-frozen",
      label: "D frozen",
      jurisdiction: "Australia · Year 7 maths",
      note: "Frozen draft fixture",
      ready: true,
      result: frozenDraft,
      events: frozenEvents,
    },
    {
      id: "refusal",
      label: "Refusal",
      jurisdiction: "Australia · exam emulation",
      note: "Missing blueprint",
      ready: true,
      result: frozenRefusal,
    },
    {
      id: "a",
      label: "A",
      jurisdiction: "Texas writing",
      note: caseA ? "Frozen transfer fixture" : "Awaiting frozen fixture",
      ready: Boolean(caseA),
      result: caseA,
    },
    {
      id: "b",
      label: "B",
      jurisdiction: "US K–2 reading",
      note: caseB ? "Frozen transfer fixture" : "Awaiting frozen fixture",
      ready: Boolean(caseB),
      result: caseB,
    },
    {
      id: "c",
      label: "C",
      jurisdiction: "Non-US, non-English",
      note: caseC ? "Frozen transfer fixture" : "Awaiting frozen fixture",
      ready: Boolean(caseC),
      result: caseC,
    },
  ];
}

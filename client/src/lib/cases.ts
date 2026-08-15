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
 * client/src/fixtures so Vite's client root can import them.
 *
 * Every case-*.json is produced by `npm run demo-fixtures`, which runs the real
 * compiler and writes a file only if it parses against CompilationResult. A card
 * whose fixture is absent stays disabled: the strip never shows a hand-authored
 * bundle, which is the same rule the compiler itself follows.
 */
export const frozenDraft: CompilationResultType = CompilationResult.parse(draftJson);
export const frozenRefusal: CompilationResultType = CompilationResult.parse(refusalJson);
export const frozenEvents: AgentEventType[] = AgentEvent.array().parse(eventsJson);
export const frozenDemoRequest: CompilationRequestType = CompilationRequest.parse(demoRequestJson);

export type TransferCaseId = "d-live" | "d-frozen" | "refusal" | "au-y8" | "a" | "b" | "c";

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

function extraResult(id: "au-y8" | "a" | "b" | "c"): CompilationResultType | undefined {
  const match = Object.entries(extraCases).find(([path]) => path.includes(`case-${id}.json`));
  if (!match) {
    return undefined;
  }
  const parsed = CompilationResult.safeParse((match[1] as { default?: unknown }).default ?? match[1]);
  return parsed.success ? parsed.data : undefined;
}

export function transferCases(hasLiveResult: boolean): TransferCase[] {
  const caseAuY8 = extraResult("au-y8");
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
      // The real transfer: a second fetched ACARA level, compiled by the same
      // engine against its own snapshot and its own AC9M8 codes.
      id: "au-y8",
      label: "Year 8",
      jurisdiction: "Australia · Year 8 maths",
      note: caseAuY8 ? "Second fetched level, compiled" : "Awaiting frozen fixture",
      ready: Boolean(caseAuY8),
      result: caseAuY8,
    },
    {
      id: "a",
      label: "A",
      jurisdiction: "Texas · Grade 5 RLA",
      note: caseA ? "Refused, TEKS not fetched" : "Awaiting frozen fixture",
      ready: Boolean(caseA),
      result: caseA,
    },
    {
      // No fetched source and no registered adapter, so there is nothing honest to
      // freeze. The card stays disabled rather than showing an invented bundle.
      id: "b",
      label: "B",
      jurisdiction: "US K–2 reading",
      note: caseB ? "Frozen transfer fixture" : "No source fetched",
      ready: Boolean(caseB),
      result: caseB,
    },
    {
      id: "c",
      label: "C",
      jurisdiction: "India · Class 7, Hindi",
      note: caseC ? "Refused, NCERT not fetched" : "Awaiting frozen fixture",
      ready: Boolean(caseC),
      result: caseC,
    },
  ];
}

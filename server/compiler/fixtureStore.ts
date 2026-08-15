import {
  CompilationResult,
  CompilationRequest,
  AgentEvent,
  type CompilationResult as CompilationResultType,
  type CompilationRequest as CompilationRequestType,
  type AgentEvent as AgentEventType,
} from "@contracts";
import demoRequestJson from "../../fixtures/demo-request.json";
import compilationResultJson from "../../fixtures/compilation-result.json";
import agentEventsJson from "../../fixtures/agent-events.json";
import refusalResultJson from "../../fixtures/refusal-result.json";

/**
 * The frozen fixture set, parsed once at start-up. If a fixture stops satisfying
 * the contracts, the process fails loudly here rather than serving a broken shape.
 *
 * Private to the compiler implementation. Callers reach fixtures only through
 * the compile operation.
 */
export const demoRequest: CompilationRequestType = CompilationRequest.parse(demoRequestJson);
export const sampleResult: CompilationResultType = CompilationResult.parse(compilationResultJson);
export const refusalResult: CompilationResultType = CompilationResult.parse(refusalResultJson);
export const sampleEvents: AgentEventType[] = AgentEvent.array().parse(agentEventsJson);

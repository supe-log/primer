import {
  AgentEvent,
  CompilationResult,
  type AgentEvent as AgentEventType,
  type CompilationRequest as CompilationRequestType,
  type CompilationResult as CompilationResultType,
} from "@contracts";
import { apiRequest, API_BASE } from "./queryClient";
import { GraphView, PublicExportBundle, type GraphView as GraphViewType, type PublicExportBundle as PublicExportBundleType } from "./views";

/**
 * Client side of the compiler seam. Every response is parsed against the shared
 * contracts before it reaches a component, so a shape change fails loudly here
 * rather than as a blank panel three components deep.
 */

export async function compile(
  request: CompilationRequestType,
): Promise<CompilationResultType> {
  const response = await apiRequest("POST", "/api/compile", request);
  const json = await response.json();
  return CompilationResult.parse(json);
}

export async function fetchDemoRequest(): Promise<CompilationRequestType> {
  const response = await apiRequest("GET", "/api/demo-request");
  return (await response.json()) as CompilationRequestType;
}

export async function fetchEvents(runId: string): Promise<AgentEventType[]> {
  const response = await apiRequest("GET", `/api/runs/${encodeURIComponent(runId)}/events`);
  return AgentEvent.array().parse(await response.json());
}

export async function fetchGraph(runId: string): Promise<GraphViewType> {
  const response = await apiRequest("GET", `/api/runs/${encodeURIComponent(runId)}/graph`);
  return GraphView.parse(await response.json());
}

export async function fetchExport(runId: string): Promise<PublicExportBundleType> {
  const response = await apiRequest("GET", `/api/runs/${encodeURIComponent(runId)}/export`);
  return PublicExportBundle.parse(await response.json());
}

/**
 * Subscribes to the run's server-sent event stream. Falls back to the JSON event
 * list when EventSource is unavailable or the stream errors, so the pipeline panel
 * always fills in. Returns an unsubscribe function.
 */
export function streamEvents(
  runId: string,
  onEvent: (event: AgentEventType) => void,
  onDone: () => void,
): () => void {
  const url = `${API_BASE}/api/runs/${encodeURIComponent(runId)}/stream`;
  let closed = false;

  if (typeof EventSource === "undefined") {
    void fetchEvents(runId)
      .then((events) => {
        if (!closed) events.forEach(onEvent);
      })
      .finally(onDone);
    return () => {
      closed = true;
    };
  }

  const source = new EventSource(url);
  let received = 0;

  source.onmessage = (message) => {
    const parsed = AgentEvent.safeParse(JSON.parse(message.data));
    if (parsed.success) {
      received += 1;
      onEvent(parsed.data);
    }
  };

  source.addEventListener("done", () => {
    source.close();
    onDone();
  });

  source.onerror = () => {
    source.close();
    if (received === 0) {
      void fetchEvents(runId)
        .then((events) => {
          if (!closed) events.forEach(onEvent);
        })
        .finally(onDone);
      return;
    }
    onDone();
  };

  return () => {
    closed = true;
    source.close();
  };
}

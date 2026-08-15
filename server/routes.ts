import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { CompilationRequest, SCHEMA_VERSION } from "@contracts";
import { createCompiler, COMPILER_VERSION } from "./compiler";
import { buildGraphView } from "./compiler/export/graphView";
import { buildPublicExport } from "./compiler/export/publicBundle";
import { demoRequest } from "./compiler/fixtureStore";

/**
 * HTTP surface. Thin on purpose: parse, delegate to the compiler seam, serialize.
 * No pipeline logic lives here.
 *
 *   GET  /api/health                  liveness plus contract and compiler versions
 *   GET  /api/demo-request            the frozen demo request, for prefilling the form
 *   POST /api/compile                 validate a request and run one compile
 *   GET  /api/runs/:runId/events      the run's event list as JSON
 *   GET  /api/runs/:runId/stream      the same events as server-sent events
 *   GET  /api/runs/:runId/export      cite-only-safe public bundle
 *   GET  /api/runs/:runId/graph       nodes and edges for the UI
 */
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const compiler = createCompiler();

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      compilerVersion: COMPILER_VERSION,
      modelClient: process.env.XAI_API_KEY ? "xai-key-present" : "mock",
    });
  });

  app.get("/api/demo-request", (_req: Request, res: Response) => {
    res.json(demoRequest);
  });

  app.post("/api/compile", async (req: Request, res: Response) => {
    const parsed = CompilationRequest.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "request does not satisfy CompilationRequest",
        schemaVersion: SCHEMA_VERSION,
        issues: parsed.error.issues,
      });
      return;
    }

    const result = await compiler.compile(parsed.data);
    res.status(200).json(result);
  });

  app.get("/api/runs/:runId/events", (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const events = compiler.observe(runId);
    if (events.length === 0) {
      res.status(404).json({ message: `no events recorded for run ${runId}` });
      return;
    }
    res.json(events);
  });

  app.get("/api/runs/:runId/export", (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const result = compiler.result(runId);
    if (!result) {
      res.status(404).json({ message: `no export recorded for run ${runId}` });
      return;
    }
    res.json(buildPublicExport(result));
  });

  app.get("/api/runs/:runId/graph", (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const result = compiler.result(runId);
    if (!result?.graph) {
      res.status(404).json({ message: `no graph recorded for run ${runId}` });
      return;
    }
    res.json(buildGraphView(result.runId, result.graph));
  });

  // True server-sent events over an already completed run. The compiler records the
  // whole event list, and this route replays it with a small delay so the pipeline
  // is legible on a projector. When Engineer 1 makes stages stream live, this route
  // switches from replay to a live subscription without changing the client.
  app.get("/api/runs/:runId/stream", (req: Request, res: Response) => {
    const runId = String(req.params.runId);
    const events = compiler.observe(runId);
    if (events.length === 0) {
      res.status(404).json({ message: `no events recorded for run ${runId}` });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let index = 0;
    const timer = setInterval(() => {
      const event = events[index];
      if (!event) {
        res.write("event: done\ndata: {}\n\n");
        clearInterval(timer);
        res.end();
        return;
      }
      res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      index += 1;
    }, 180);

    req.on("close", () => clearInterval(timer));
  });

  return httpServer;
}

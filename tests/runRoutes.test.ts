import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { CompilationRequest, CompilationResult } from "@contracts";
import { registerRoutes } from "../server/routes";
import { GraphView, PublicExportBundle } from "../client/src/lib/views";
import demoRequestJson from "../fixtures/demo-request.json";

const demoRequest = CompilationRequest.parse(demoRequestJson);

const CITE_ONLY_IDS = [
  "src:ies.interleaving-rct",
  "src:ies.organizing-instruction",
];

async function listenApi(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  const server: Server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("compile persist and presentation routes", () => {
  let close: (() => Promise<void>) | undefined;
  let url = "";

  afterEach(async () => {
    if (close) await close();
    close = undefined;
  });

  async function start() {
    const api = await listenApi();
    url = api.url;
    close = api.close;
    return url;
  }

  it("persists a compile so /graph and /export can be loaded by runId", async () => {
    const base = await start();
    const compiled = await fetch(`${base}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoRequest),
    });
    expect(compiled.status).toBe(200);
    const result = CompilationResult.parse(await compiled.json());
    expect(result.status).toBe("draft");

    const graphResponse = await fetch(`${base}/api/runs/${encodeURIComponent(result.runId)}/graph`);
    expect(graphResponse.status).toBe(200);
    const graph = GraphView.parse(await graphResponse.json());
    expect(graph.runId).toBe(result.runId);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.standards.every((standard) => standard.statement.length > 0)).toBe(true);
    expect(JSON.stringify(graph)).not.toContain("quotedSpan");

    const exportResponse = await fetch(`${base}/api/runs/${encodeURIComponent(result.runId)}/export`);
    expect(exportResponse.status).toBe(200);
    const exported = PublicExportBundle.parse(await exportResponse.json());
    expect(exported.runId).toBe(result.runId);
    expect(exported.alignment.coverageOk).toBe(true);
    for (const sourceId of CITE_ONLY_IDS) {
      const citation = exported.citations.find((entry) => entry.sourceId === sourceId);
      expect(citation).toBeDefined();
      expect(citation?.quotedText).toBeUndefined();
      expect(exported.licence.citeOnlySourceIds).toContain(sourceId);
    }
  });

  it("keeps two runs independently addressable", async () => {
    const base = await start();
    const first = CompilationResult.parse(
      await (
        await fetch(`${base}/api/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(demoRequest),
        })
      ).json(),
    );
    const second = CompilationResult.parse(
      await (
        await fetch(`${base}/api/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...demoRequest, lessonCount: 4 }),
        })
      ).json(),
    );
    expect(first.runId).not.toBe(second.runId);

    const firstGraph = GraphView.parse(
      await (await fetch(`${base}/api/runs/${encodeURIComponent(first.runId)}/graph`)).json(),
    );
    const secondExport = PublicExportBundle.parse(
      await (await fetch(`${base}/api/runs/${encodeURIComponent(second.runId)}/export`)).json(),
    );
    expect(firstGraph.runId).toBe(first.runId);
    expect(secondExport.runId).toBe(second.runId);
  });

  it("returns 404 for an unknown run and still exports a refused compile", async () => {
    const base = await start();
    const missing = await fetch(`${base}/api/runs/${encodeURIComponent("run:does.not.exist")}/graph`);
    expect(missing.status).toBe(404);

    const refused = CompilationResult.parse(
      await (
        await fetch(`${base}/api/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...demoRequest, assessmentTarget: "official_exam_emulation" }),
        })
      ).json(),
    );
    expect(refused.status).toBe("refused");

    const graph = await fetch(`${base}/api/runs/${encodeURIComponent(refused.runId)}/graph`);
    expect(graph.status).toBe(404);

    const exported = PublicExportBundle.parse(
      await (await fetch(`${base}/api/runs/${encodeURIComponent(refused.runId)}/export`)).json(),
    );
    expect(exported.status).toBe("refused");
    expect(exported.course).toBeUndefined();
    expect(exported.citations.length).toBeGreaterThan(0);
    expect(exported.citations.every((citation) => citation.quotedText === undefined)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { CompilationRequest } from "@contracts";
import { createCompiler } from "../server/compiler";
import { buildGraphView } from "../server/compiler/export/graphView";
import { buildPublicExport } from "../server/compiler/export/publicBundle";
import { citationRows, exportShowsCiteOnlyBody } from "../client/src/lib/exportView";
import { inspectNode, layerIndex, layoutGraph } from "../client/src/lib/graphLayout";
import { GraphView, PublicExportBundle } from "../client/src/lib/views";
import { STANDARD_OPTIONS } from "../client/src/components/IntakeForm";
import demoRequestJson from "../fixtures/demo-request.json";

const demoRequest = CompilationRequest.parse(demoRequestJson);

const IES_BODY = "PROTECTED IES INTERLEAVING PASSAGE THAT MUST NOT LEAVE THE BOX";

describe("intake standards match the live demo request", () => {
  it("offers the official AC9 codes the compiler will compile", () => {
    const offered = STANDARD_OPTIONS.map((option) => option.id);
    expect(offered).toEqual(demoRequest.standardIds);
    expect(offered.every((id) => id.includes("ac9m7"))).toBe(true);
  });
});

describe("demo graph inspect contract", () => {
  it("lays out a DAG left to right and inspects standard text for a clicked node", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);
    const view = GraphView.parse(buildGraphView(result.runId, result.graph!));

    const layers = layerIndex(view);
    const roots = view.nodes.filter((node) => view.edges.every((edge) => edge.to !== node.id));
    for (const root of roots) {
      expect(layers.get(root.id)).toBe(0);
    }
    for (const edge of view.edges) {
      expect(layers.get(edge.to) ?? 0).toBeGreaterThan(layers.get(edge.from) ?? 0);
    }

    const layout = layoutGraph(view);
    expect(layout.nodes).toHaveLength(view.nodes.length);
    const left = Math.min(...layout.nodes.map((node) => node.x));
    const right = Math.max(...layout.nodes.map((node) => node.x));
    expect(right).toBeGreaterThan(left);

    const mapped = view.nodes.find((node) => node.standardIds.length > 0);
    expect(mapped).toBeDefined();
    const inspection = inspectNode(view, mapped!.id);
    expect(inspection?.node.description.length).toBeGreaterThan(0);
    expect(inspection?.standards.length).toBeGreaterThan(0);
    expect(inspection?.standards[0]?.statement.length).toBeGreaterThan(0);
    expect(inspection?.standards[0]?.sourceCode.length).toBeGreaterThan(0);
  });
});

describe("demo export panel contract", () => {
  it("never surfaces a cite-only body, even if the payload leaked one", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);
    const exported = PublicExportBundle.parse(buildPublicExport(result));
    expect(exportShowsCiteOnlyBody(exported)).toBe(false);
    const citeOnly = citationRows(exported).filter((row) => row.citeOnly);
    expect(citeOnly.length).toBeGreaterThan(0);
    expect(citeOnly.every((row) => row.quote === undefined)).toBe(true);

    const leaked: typeof exported = {
      ...exported,
      citations: exported.citations.map((citation) =>
        exported.licence.citeOnlySourceIds.includes(citation.sourceId)
          ? { ...citation, quotedText: IES_BODY }
          : citation,
      ),
    };
    expect(leaked.citations.some((citation) => citation.quotedText === IES_BODY)).toBe(true);
    expect(exportShowsCiteOnlyBody(leaked)).toBe(false);
    expect(citationRows(leaked).every((row) => row.quote !== IES_BODY)).toBe(true);
  });
});

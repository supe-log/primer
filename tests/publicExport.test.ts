import { describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult } from "@contracts";
import { createCompiler } from "../server/compiler";
import { buildGraphView } from "../server/compiler/export/graphView";
import {
  buildPublicExport,
  publicExportLeaks,
} from "../server/compiler/export/publicBundle";
import compilationResult from "../fixtures/compilation-result.json";
import demoRequestJson from "../fixtures/demo-request.json";

const sample = CompilationResult.parse(compilationResult);
const demoRequest = CompilationRequest.parse(demoRequestJson);

const IES_BODY =
  "PROTECTED IES INTERLEAVING PASSAGE THAT MUST NOT LEAVE THE BOX";

function leakedSample(): CompilationResult {
  const plan = sample.coursePlan!;
  const first = plan.lessons[0]!;
  return {
    ...sample,
    coursePlan: {
      ...plan,
      lessons: [
        {
          ...first,
          objective: `${first.objective} See also: ${IES_BODY}`,
        },
        ...plan.lessons.slice(1),
      ],
    },
  };
}

describe("public export (AC-10)", () => {
  it("exports cite-only sources as a citation and a link, never quoted text", () => {
    const exported = buildPublicExport(sample, {
      protectedBodies: { "src:ies.interleaving-rct": IES_BODY },
    });
    const citeOnly = exported.citations.find((entry) => entry.sourceId === "src:ies.interleaving-rct");
    expect(citeOnly).toBeDefined();
    expect(citeOnly?.url).toMatch(/^https?:/);
    expect(citeOnly?.attributionText).toBe(
      "Institute of Education Sciences, U.S. Department of Education.",
    );
    expect(citeOnly?.quotedText).toBeUndefined();
    expect(exported.licence.citeOnlySourceIds).toContain("src:ies.interleaving-rct");
    expect(exported.licence.redistributableSourceIds).toContain("src:acara.v9.terms");
  });

  it("strips a leaked cite-only snapshot body from lesson prose", () => {
    const leaked = leakedSample();
    expect(JSON.stringify(leaked)).toContain(IES_BODY);

    const exported = buildPublicExport(leaked, {
      protectedBodies: { "src:ies.interleaving-rct": IES_BODY },
    });
    expect(JSON.stringify(exported)).not.toContain(IES_BODY);
    expect(publicExportLeaks(exported, { "src:ies.interleaving-rct": IES_BODY })).toEqual([]);
    expect(exported.licence.strippedSourceIds).toEqual(["src:ies.interleaving-rct"]);
    expect(exported.course?.lessons[0]?.objective).toContain("[cite only: src:ies.interleaving-rct]");
  });

  it("keeps attribution text verbatim and still exports a refused run", async () => {
    const compiler = createCompiler();
    const refused = await compiler.compile({
      ...demoRequest,
      assessmentTarget: "official_exam_emulation",
    });
    expect(refused.status).toBe("refused");

    const exported = buildPublicExport(refused);
    expect(exported.status).toBe("refused");
    expect(exported.course).toBeUndefined();
    expect(exported.items).toEqual([]);
    expect(exported.refusal?.code).toBe("missing_blueprint");
    for (const citation of exported.citations) {
      const source = refused.sourceManifest.sources.find((entry) => entry.sourceId === citation.sourceId);
      expect(citation.attributionText).toBe(source?.licence.attributionText);
    }
  });

  it("covers every requested standard on the live deterministic compile", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);
    const exported = buildPublicExport(result);
    expect(exported.alignment.coverageOk).toBe(true);
    expect(exported.alignment.mappedStandardIds).toEqual(demoRequest.standardIds);
    expect(exported.alignment.assessedStandardIds).toEqual(demoRequest.standardIds);
    expect(compiler.result(result.runId)?.runId).toBe(result.runId);
  });
});

describe("graph view", () => {
  it("projects nodes and edges without evidence spans", () => {
    const view = buildGraphView(sample.runId, sample.graph!);
    expect(view.nodes.length).toBe(sample.graph!.knowledgeComponents.length);
    expect(view.edges.length).toBe(sample.graph!.prerequisiteEdges.length);
    expect(view.standards.length).toBe(sample.graph!.standards.length);
    expect(view.stats.nodes).toBe(view.nodes.length);
    expect(JSON.stringify(view)).not.toContain("quotedSpan");
    expect(view.nodes.every((node) => node.label.length > 0)).toBe(true);
  });

  it("is available from a completed compile handle", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);
    const stored = compiler.result(result.runId);
    expect(stored?.graph).toBeDefined();
    const view = buildGraphView(result.runId, stored!.graph!);
    expect(view.runId).toBe(result.runId);
    expect(view.stats.edges).toBeGreaterThan(0);
    expect(view.nodes.some((node) => node.prerequisiteOnly)).toBe(true);
  });
});

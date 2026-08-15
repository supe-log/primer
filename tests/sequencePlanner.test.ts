import { describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult, CoursePlan } from "@contracts";
import { planSequence } from "../server/compiler/stages/sequencePlanner";
import { validateCoursePlan } from "../server/compiler/validators";
import { buildFallbackBundle } from "../server/compiler/stages/fallbackBundle";
import { auAcaraAdapter } from "../server/compiler/adapters/jurisdiction";
import demoRequestJson from "../fixtures/demo-request.json";
import compilationResult from "../fixtures/compilation-result.json";

const demoRequest = CompilationRequest.parse(demoRequestJson);
const sample = CompilationResult.parse(compilationResult);

describe("sequence planner", () => {
  it("emits a course plan that parses and respects every prerequisite", () => {
    const plan = planSequence({
      graph: sample.graph!,
      request: demoRequest,
      sourceManifest: sample.sourceManifest,
    });
    expect(() => CoursePlan.parse(plan)).not.toThrow();
    expect(plan.lessons).toHaveLength(demoRequest.lessonCount);

    const failures = validateCoursePlan(plan, sample.graph!).filter((check) => check.status === "fail");
    expect(failures).toHaveLength(0);
  });

  it("is deterministic for the same graph and request", () => {
    const first = planSequence({ graph: sample.graph!, request: demoRequest });
    const second = planSequence({ graph: sample.graph!, request: demoRequest });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("records a reason and an evidence level on every sequencing decision", () => {
    const plan = planSequence({
      graph: sample.graph!,
      request: demoRequest,
      sourceManifest: sample.sourceManifest,
    });
    const decisions = [...plan.decisions, ...plan.lessons.flatMap((lesson) => lesson.decisions)];
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.reason.length).toBeGreaterThan(0);
      expect(["strong", "moderate", "low", "convention"]).toContain(decision.evidenceLevel);
    }
  });
});

describe("deterministic fallback bundle", () => {
  it("builds a schema-valid graph, plan and item bank for the demo request", () => {
    const bundle = buildFallbackBundle({
      request: demoRequest,
      adapter: auAcaraAdapter,
      sourceManifest: sample.sourceManifest,
    });
    expect(bundle.refusal).toBeUndefined();
    expect(bundle.graph).toBeDefined();
    expect(bundle.coursePlan).toBeDefined();
    expect(bundle.items.length).toBeGreaterThan(0);
    expect(bundle.items.some((item) => item.rejection)).toBe(true);
    expect(bundle.items.filter((item) => item.rejection).every((item) => item.rejection?.checkId)).toBe(
      true,
    );
  });
});

import { createCompiler } from "./server/compiler/index";
import { CompilationRequest } from "@contracts";
import demo from "./fixtures/demo-request.json";

async function main() {
  const req = CompilationRequest.parse(demo);
  for (let i = 0; i < 3; i += 1) {
    const c = createCompiler();
    const r = await c.compile(req);
    const w = c.observe(r.runId).find((e) => e.agentId === "agent:item-writer");
    const rej = r.items.filter((x) => x.rejection).length;
    const cov = r.gateReport.checks.find((x) => x.checkId === "check:coverage.standards")!.status;
    console.log(
      `run ${i + 1}: components=${r.graph!.knowledgeComponents.length} passes=${w?.counts.passes} ` +
      `gapFilled=${w?.counts.gapFilled} shipped=${r.items.length - rej} rejected=${rej} ` +
      `uncovered=${w?.counts.componentsWithoutItem} coverage=${cov} verdict=${r.gateReport.verdict} ` +
      `calls=${r.runManifest.modelCalls.filter((m) => m.agentId === "agent:item-writer").length}`,
    );
  }
}
main();

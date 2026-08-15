import { mkdir, writeFile } from "node:fs/promises";
import { CompilationRequest, CompilationResult } from "@contracts";
import { createCompiler } from "../server/compiler";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * Ten-run reliability script. A run counts if it returns a schema-valid bundle
 * or a schema-valid refusal. Nine of ten is the freeze bar.
 *
 * Writes the first valid draft bundle to fixtures/fallback/best-run.json so the
 * stage path has a cached artifact. Does not rewrite the four canonical fixtures.
 */

const RUNS = 10;
const PASS_FLOOR = 9;

async function main() {
  const request = CompilationRequest.parse(demoRequestJson);
  let passed = 0;
  let cached: ReturnType<typeof CompilationResult.parse> | undefined;

  for (let index = 0; index < RUNS; index += 1) {
    const compiler = createCompiler();
    const result = await compiler.compile(request);
    const parsed = CompilationResult.safeParse(result);
    const ok =
      parsed.success &&
      (parsed.data.status === "refused" || parsed.data.status === "draft" || parsed.data.status === "published");
    if (ok) {
      passed += 1;
      if (!cached && parsed.data.status !== "refused") cached = parsed.data;
    } else {
      console.error(`run ${index + 1} failed schema or status`, parsed.success ? parsed.data.status : parsed.error);
    }
  }

  console.log(`reliability: ${passed}/${RUNS} valid bundle or refusal`);
  if (cached) {
    await mkdir("fixtures/fallback", { recursive: true });
    await writeFile("fixtures/fallback/best-run.json", `${JSON.stringify(cached, null, 2)}\n`);
    console.log("cached fixtures/fallback/best-run.json");
  }

  if (passed < PASS_FLOOR) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

# Parallel build guide

Two engineers, one repository, no merge conflicts. Section 20 of `ENGINEERING_HANDOFF.md` is the long version. This is the
working copy to keep open.

## Split

**Engineer 1 owns the compiler.** `server/compiler/**`, `server/routes.ts`, `server/index.ts`, fixture regeneration,
`tests/validators.test.ts`, `tests/compiler.test.ts`.

**Engineer 2 owns the interface.** `client/src/**`, `client/src/index.css`, `tailwind.config.ts`, `client/index.html`.

**Joint and frozen.** `shared/contracts/**` at 0.1.0, `tests/contracts.test.ts`, `docs/**`.

## The seam

```ts
interface Compiler {
  compile(request: CompilationRequest): Promise<CompilationResult>;
  observe(runId: string): AgentEvent[];
}
```

Over HTTP:

| Route | Method | In | Out |
|---|---|---|---|
| `/api/health` | GET | | `{ ok, schemaVersion, compilerVersion, modelClient }` |
| `/api/demo-request` | GET | | `CompilationRequest` |
| `/api/compile` | POST | `CompilationRequest` | `CompilationResult`, or 400 with a Zod issue list |
| `/api/runs/:runId/events` | GET | | `AgentEvent[]`, or 404 |
| `/api/runs/:runId/stream` | GET | | server sent events, one `AgentEvent` per message, then `done` |

Rules that keep this safe:

1. The compiler never throws for a bad or unsupported request. It returns status `refused` with a refusal report. Render
   refusals as a first class state, not an error toast.
2. Events carry no artifact bodies. Artifacts arrive in the result.
3. The client parses every response against the contracts before it reaches a component.
4. Neither engineer is ever blocked. Engineer 2 can render straight from `fixtures/`. Engineer 1 can drive the whole
   pipeline through `createCompiler()` in Vitest with no browser.

## Communication protocol

- Announce, do not ask. Say what you are changing, which files, and how long. No approval needed inside your own
  directories.
- Any `shared/contracts` change is spoken aloud and written down. Both people acknowledge in writing before it lands.
- Say "blocked" immediately. If you have waited five minutes, switch to a fixture and keep moving.
- Commit small and often, with the directory in the message: "compiler: real ACARA adapter", "client: gate panel".
- Announce before `npm install`.
- Paste `npm run verify` output at every checkpoint.

## Integration checkpoints

| Time | Checkpoint | Green means |
|---|---|---|
| 11:00 AM | Contracts confirmed | Both sides `npm run verify` green. Engineer 2 renders the fixture bundle end to end. Engineer 1's compiler returns a draft result |
| 12:00 PM | Real source path | One real fetched and hashed source with a licence record. Licence badge and one node's provenance visible |
| 1:00 PM | Real generation path | At least one agent stage is a real model call producing a schema valid artifact, visible in the pipeline, with rejections shown |
| **1:15 PM** | **Hard freeze on scope** | Whatever is green is the demo. Fixes and polish only |
| 2:00 PM | Code freeze, reliability | Nine of ten scripted runs finish with a valid bundle or a valid refusal. Fallback run cached |
| 2:20 PM | Demo recorded | Three minutes maximum, audio checked |
| 2:40 PM | Submission started | Submitted before the 3:00 PM close |

## Conflict avoidance

1. One file, one owner. Ask for a handover rather than editing across the line.
2. Never reformat a file you do not own. No mass reformatting at all today.
3. Add rather than restructure. After 2:00 PM, neither.
4. `shared/contracts` is append friendly and edit hostile. Optional field, cheap. Rename, version bump.
5. Do not edit `package.json` scripts. Add one if you need it.
6. Fixtures are shared truth. Need a different one, add a file. Engineer 1 regenerating the four canonical fixtures says
   so and re-runs the tests.
7. If both of you touched a file, the owner resolves. No merge archaeology under time pressure.

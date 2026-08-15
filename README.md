# Primer Compiler

Turns an official curriculum into a sequenced course and a standards tagged question bank, and refuses to ship anything
it cannot trace to a source, a prerequisite and a passing check.

> **Read [`ENGINEERING_HANDOFF.md`](./ENGINEERING_HANDOFF.md) first.** It is the single document that carries the problem,
> the product requirements, the system design, the demo script, the ownership split and the timeline. You do not need the
> 32,000 word research report to start building, though it is the evidence layer behind every claim.

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5000, Express and Vite on one port
npm run check        # typecheck
npm test             # contract, validator, gate and compiler tests
npm run build        # production build into dist/
npm run verify       # check, test and build in one go
```

No API key is needed. With no key set, the model client abstains and the deterministic path still produces a full bundle,
which is also the stage fallback. Copy `.env.example` to `.env` and set `XAI_API_KEY` when the real client is wired.

Try both paths in the app: submit the prefilled form for a draft bundle, then switch the assessment target to official
exam emulation to see the refusal.

## Ownership map

| Path | Owner |
|---|---|
| `shared/contracts/**` | **Joint, frozen at 0.1.0.** Changes follow `docs/SCHEMA_CHANGELOG.md` |
| `fixtures/**` | Engineer 1 writes, Engineer 2 reads |
| `server/compiler/**`, `server/routes.ts`, `server/index.ts` | Engineer 1 |
| `client/src/**`, `client/src/index.css`, `tailwind.config.ts` | Engineer 2 |
| `tests/contracts.test.ts` | Joint |
| `tests/validators.test.ts`, `tests/compiler.test.ts` | Engineer 1 |
| `docs/**`, `AGENTS.md`, `.cursor/rules/**` | Either, append only |

Full rules, communication protocol and integration checkpoints: `docs/PARALLEL_BUILD.md` and section 20 of the handoff.

## Current status

Working today, verified by `npm run verify`:

- Contracts 0.1.0 for request, sources and evidence, curriculum graph, course plan and lessons, question items, gate
  checks and reports, agent events, run manifest and compilation result.
- Four fixtures that all parse against the contracts: `demo-request.json`, `compilation-result.json`,
  `agent-events.json`, `refusal-result.json`.
- A compiler seam with exactly two operations, `compile` and `observe`, with adapters, validators and gate arithmetic
  private behind it.
- Real deterministic validators: graph acyclicity with cycle naming, dangling edges, unjustified edges, orphans,
  misconception resolution, topological order, lesson arc completeness, standards coverage, item single key, distractor
  to misconception mapping, option style, demand histogram, calibration labelling, licence records, snapshot fetch state,
  and a student information scan that hard blocks.
- Gate arithmetic in code with the five level verdict vocabulary and permission tiers, plus abstention that never becomes
  a pass.
- Two working refusal paths: official exam emulation with no blueprint, and an unregistered jurisdiction.
- A `ModelClient` interface with `MockModelClient`, so the xAI client drops in without changing any caller.
- Express routes for health, demo request, compile, an event list and a server sent event stream.
- A React interface with the intake form, live pipeline status, artifact summary and gate verdict, in a warm paper and
  teal palette with dark mode.
- 34 tests across contracts, validators, gate arithmetic and the compiler seam.

Deliberately not built yet: real source fetching, any real model call, React Flow, a database, authentication, and any
claim about learning.

## Next actions

**Engineer 1, compiler.** Read `server/compiler/index.ts`, then `orchestrator.ts`. Replace the fixture replay with real
stages one at a time, in this order.

1. Real ACARA source acquisition: fetch the selected content descriptions, SHA-256 the bytes, record URL, retrieval time,
   publisher and licence, so `check:source.snapshot-fetched` passes.
2. `XaiModelClient` implementing `ModelClient` in `server/compiler/model/`, with `grok-4.6` structured outputs. Do not
   change any caller.
3. Curriculum mapper on real standards, then the graph auditor's two pass repair loop and its abstain path.
4. Item writer with per distractor misconceptions through the same seam.
5. Precompute the transfer cases into frozen fixtures. Any case that will not compile becomes a documented refusal rather
   than a fake bundle.
6. Ten run reliability script, then cache the best run as the stage fallback.

**Engineer 2, interface.** Read `client/src/pages/Compile.tsx`, then the four components. Everything you need already
arrives typed.

1. Make the pipeline panel the demo centrepiece: per stage grouping, counters, failures naming the exact rule.
2. Licence badge on the form and provenance detail on a knowledge component.
3. Rejected items visibly rejected with the reason. This is the proof the gates ran.
4. Refusal screen that reads well on a projector.
5. Transfer strip that swaps artifact panes without re-running the pipeline, once Engineer 1 has the frozen cases.
6. Visual pass at 1440 and 375 wide, dark and light, with loading, empty and refusal states.

**Both.** No storage APIs anywhere, no student data anywhere, and no contract change without the process in
`docs/SCHEMA_CHANGELOG.md`.

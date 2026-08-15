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

npm run snapshot        # refetch, hash and rewrite snapshots/. Needs poppler for the PDF sources
npm run demo-fixtures   # recompile the frozen transfer-strip fixtures under client/src/fixtures/
npm run reliability     # ten scripted compiles, and cache the best run as the stage fallback
```

No API key is needed. With no key set, the model client abstains, the gate records the abstention rather than a pass, and
the deterministic path still produces a full bundle, which is also the stage fallback. Copy `.env.example` to `.env` and
set `XAI_API_KEY` to switch the mapper and item writer to `grok-4.6`. No caller changes either way.

`snapshot` and `demo-fixtures` are run by a human ahead of a demo and their output is committed, so a compile never
touches the network and never depends on a model being reachable.

Try both paths in the app: submit the prefilled form for a draft bundle, then switch the assessment target to official
exam emulation to see the refusal.

## Deploy (Vercel)

The client is a Vite static build. `/api/*` is one Express function so compile, stream, graph and export share the
in-memory run store. Set `XAI_API_KEY` in the Vercel project if you want the live model path; without it the
deterministic fallback still compiles.

```bash
npx vercel link
npx vercel env add XAI_API_KEY
npx vercel --prod
```

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

Working today, verified by `npm run verify`.

**Real sources, hashed.** Six sources are fetched by `npm run snapshot`, SHA-256 hashed and committed under
`snapshots/`, so a compile does no network I/O and every digest in a run manifest is checkable against a file in this
repository. The store recomputes each digest at start-up and fails the process if bytes and digest disagree.

| Source | Licence | What it carries |
|---|---|---|
| ACARA V9, Year 7 Mathematics | CC BY 4.0 | 30 content descriptions, 20 achievement standard segments, 118 elaborations |
| ACARA V9, Year 8 Mathematics | CC BY 4.0 | 27 content descriptions |
| ACARA copyright and terms of use | CC BY 4.0 | the licence itself |
| IES interleaved practice efficacy study | cite only | evidence behind the interleaving decision |
| IES practice guide on organizing instruction | cite only | evidence behind the spacing decisions |
| Rosenshine, *Principles of Instruction* | cite only | evidence behind the guided-practice target |

**Standards are read, never authored.** Every `StandardNode` carries the authority's own code verbatim, the authority's
own wording, and an evidence span that matches the hashed bytes. All 30 Year 7 content descriptions span-match.

**Two real agent stages, behind one seam.** The `ModelClient` interface has two implementations: `XaiModelClient`, using
`grok-4.6` with strict structured outputs, and `MockModelClient`. Selecting one changes no caller.

- The **curriculum mapper** decomposes fetched content descriptions into knowledge components, prerequisite edges and
  misconceptions. The model proposes pedagogy; code owns provenance. A standard code the model invents is dropped and
  counted, a dangling edge is dropped rather than repaired, ids are assigned by code, and confidence is computed from
  span matches rather than self-reported.
- The **item writer** writes stems, options, rationales and per-distractor misconception links, then faces the same
  deterministic validators. It rejects rather than repairs, and rejected items still ship with the check that caught
  them, because the rejections are the proof the gates ran.

**Everything falls back rather than fails.** With no `XAI_API_KEY` the mock abstains, the gate records an abstention that
never becomes a pass, and the deterministic path still produces a full bundle. The same fallback catches a rate limit, a
timeout, a refusal, non-JSON and a schema mismatch. A graph still unsound after two repair passes refuses instead of
being sequenced. Generation runs ahead of the pipeline, so a refusal never spends a token.

**Transfer, and honest refusal.** One engine, one schema, several stage ladders:

| Case | Ladder | Outcome |
|---|---|---|
| Australia, Year 7 Mathematics | `Year 7` | compiles, live |
| Australia, Year 8 Mathematics | `Year 8` | compiles against its own snapshot and `AC9M8*` codes |
| Texas Education Agency, Grade 5 | grades | **refuses**, TEKS not fetched |
| NCERT, Middle Stage Class 7, Hindi in Devanagari | stage and class | **refuses**, outcomes not fetched |
| Australia, Year 6 | resolves as a prerequisite stage | **refuses**, no snapshot for that level |

`Year 7` and `Middle Stage, Class 7` share an internal ordinal without sharing a label. A registered jurisdiction is not
a supported one: with no fetched curriculum behind the requested standards the compiler refuses with named missing
evidence and a collection plan, rather than emitting invented standards under an official authority's name.

**Deterministic validators**, all model-free and blocking: graph acyclicity with cycle naming, dangling edges,
unjustified edges, orphans, misconception resolution, topological order, lesson arc completeness, standards coverage,
item single key, distractor to misconception mapping, option style, demand histogram, calibration labelling, licence
records, snapshot fetch state, and a student information scan that hard blocks.

**Gate arithmetic in code**, with the five level verdict vocabulary and permission tiers. Four refusal paths reach it:
official exam emulation with no blueprint, an unregistered jurisdiction, a jurisdiction with no fetched curriculum, and
a graph that stays unsound.

**Two hard rules the code enforces, not the prose.** No student personal information exists in any contract, fixture,
form field or log, and a deterministic scan hard blocks on a forbidden field name anywhere in a request or artifact.
Nothing auto publishes: every result leaves the compiler with `approvedByHuman: false`, and there is no publish path in
the code.

Express routes for health, demo request, compile, an event list, a server-sent event stream, a graph view and a
cite-only-safe export. A React interface with the intake form, live pipeline status, artifact summary, knowledge graph,
gate verdict and transfer strip. 134 tests, and `npm run reliability` scores 10 of 10 against the live model.

Deliberately not built yet: a database, authentication, item calibration, differential item functioning, and any claim
about learning.

## Next actions

**Engineer 1, compiler.** The six items from the original handoff are done: real ACARA acquisition with hashed
snapshots, `XaiModelClient` on `grok-4.6` structured outputs, the mapper on real standards with the auditor's two-pass
repair and abstain path, the item writer with per-distractor misconceptions, the transfer cases, and the ten-run
reliability script with its cached fallback. What is left, in order:

1. A learning-science critic as a third model stage, so `check:critic.learning-science` can pass instead of abstaining.
   Not before the transfer strip is showing Texas refusing, Year 8 compiling and Year 7 live.
2. Fetch a real second jurisdiction, most likely TEKS, and turn case A from a refusal into a compile. The refusal is
   honest, but a second authority behind a hashed snapshot is the stronger claim.
3. A blueprint fetcher, which is the only thing standing between the exam-emulation refusal and a real
   `test_emulation` bundle.
4. Span-match the sequencing decisions' evidence, not just the standards, so `check:evidence.span-match` covers every
   citation in a bundle rather than the curriculum layer alone.

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

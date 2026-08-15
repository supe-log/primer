# Decisions

Append only. Newest entry wins over the section text in `ENGINEERING_HANDOFF.md`. If a decision changes during the build,
write it here rather than remembering it.

Format: date and time, decision, why, and the alternative that was rejected.

---

## 2026-08-15 10:25: Live case is Australian Curriculum V9 Year 7 mathematics

Australian curriculum material is licensed CC BY 4.0 with named exclusions, which is the only unambiguous licence in the
candidate set and the only one safe to show in a public demo video. Answer keys are computable, and grade 7 mathematics
has a directly relevant sequencing result to display.

Rejected: making the Texas writing case live. It has real measured numbers and would be more credible, and it stays the
credibility case shown as a precomputed transfer artifact. Compiling a jurisdiction the engine has not seen before is what
proves the factory rather than the artifact. Do not attempt both live.

## 2026-08-15 10:25: Contracts frozen at 0.1.0 before any feature work

Both engineers build against one contract set from minute one, so neither is ever blocked and neither has to guess a
shape. Freezing is not a claim the schemas are right, only that changing them has a known cost. Process in
`docs/SCHEMA_CHANGELOG.md`.

Rejected: growing the schema organically as each side needs fields. That is how two people produce two incompatible
mental models by lunch.

## 2026-08-15 10:25: Zod is the single contract source, not JSON Schema

Zod gives runtime validation on both sides plus inferred TypeScript types from one authored artifact, and it converts to
JSON Schema when the model client needs a structured output schema. One source, three uses.

Rejected: JSON Schema first with generated types. It is the better long term choice for structured outputs, and it costs
a generation step and a build watcher that nobody wants to debug at noon.

## 2026-08-15 10:25: Compiler seam is one operation plus event observation

`compile(request)` and `observe(runId)`. Adapters, snapshots, validators, critics, loop counters and gate arithmetic are
private to `server/compiler`. A caller cannot reach a stage, so stages can change all afternoon while routes, client and
tests stay still.

Rejected: exposing per stage functions so the client can drive the pipeline. That turns every internal change into a
client change and makes the interface as complex as the implementation.

## 2026-08-15 10:25: Model access goes through a `ModelClient` interface with a mock default

`MockModelClient` abstains on every call, which is the honest default with no key configured: the gate records an
abstention rather than a pass, and the deterministic path still produces a full bundle. That is also the stage fallback
if the API is slow at 2:30 PM.

Rejected: calling the provider SDK directly from the orchestrator. It would put a network dependency in every test and
make the fallback path an exception handler rather than a design.

## 2026-08-15 10:25: The scaffold replays frozen sample artifacts where a model would generate

The deterministic half is real today: adapters, licence gate, graph validators, sequence checks, item checks, coverage,
privacy scan, gate arithmetic and both refusal paths. Generated content is replayed from `fixtures/` and clearly marked as
a prototype sample with `fetched: false` on every source.

Rejected: stubbing the deterministic half and building the model calls first. The deterministic half is what makes the
demo trustworthy, it never fails flakily, and it is the part a judge can verify on screen.

## 2026-08-15 10:25: Sample standards are labelled samples, with no invented official codes

The prototype fixture uses `SAMPLE-Y7-N-01` style codes and says in the artifact that the official content descriptions
have not been fetched. Inventing plausible looking official codes would be the exact failure the product exists to
prevent.

Rejected: writing realistic looking curriculum codes to make the demo look finished.

## 2026-08-15 10:25: Server sent events for pipeline observation, replayed from a completed run

Progress is one directional, so server sent events are strictly simpler than websockets. Today the route replays a
completed run's event list with a small delay so the pipeline is legible on a projector. When stages stream live, the
route switches from replay to a live subscription with no client change. The client falls back to the JSON event list if
the stream fails.

Rejected: websockets, and polling.

## 2026-08-15 10:25: No database, no authentication, no state graph runtime in this scaffold

Fixtures on disk cover everything a five hour build needs, and the graph fits in memory. Postgres with an adjacency
schema, pgvector for the misconception library, a state graph runtime and author authentication are all designed for and
all deliberately absent. Every stage stays pure and idempotent so the migration path stays open.

Rejected: adding Supabase, LangGraph or Temporal today. Each is an extra failure mode before lunch.

## 2026-08-15 10:25: No student personal information, enforced by a validator rather than by discipline

There is no field for it in any contract, and a deterministic scan hard blocks on a forbidden field name in any request or
artifact. If there is no student data field, there is no student data breach, and the under 13 consent machinery is out of
scope for the prototype.

Rejected: collecting a learner name to personalize output.

## 2026-08-15 11:30: Engineer 2 ships four interface beats, no contract change

Licence badge on the intake form, pipeline grouped by stage with counters and named failures, provenance on one knowledge component, rejected items in their own section, and a projector-scale refusal screen. Contracts stay at 0.1.0. Transfer strip waits for Engineer 1's frozen cases A, B and C.

Rejected: adding a transfer strip against invented fixtures. That would fake the factory claim.

## 2026-08-15 11:30: Deterministic fallback stages sit beside the snapshot store

Engineer 1 split: live ACARA fetch and the snapshot store stay in `server/compiler/sources/`. The complementary slice is the licence policy engine, the graph auditor's two-pass repair and abstain path, and a deterministic sequence planner plus item bank used when the model client abstains. The orchestrator calls those stages instead of replaying fixture artifacts, so MockModelClient still produces a full bundle and a rejected item still ships with a stated reason.

Rejected: waiting for the xAI client before replacing fixture replay. The handoff says the deterministic half is the stage fallback and the part a judge can verify.

## 2026-08-15 11:40: Transfer strip renders D-frozen and refusal only

The strip swaps artifact panes from the two existing fixtures plus the live compile. A, B and C are visible and disabled until Engineer 1 drops schema-valid `case-a.json` files. No invented codes or accuracy numbers.

Rejected: filling A, B and C with paraphrased demo copy so the strip looked finished.

## 2026-08-15 11:40: Engineer 1 split — snapshots stay on the other session, export lands here

Claude Code (other Engineer 1 session) owns live ACARA snapshots, re-keying `fallbackMap.ts` to official AC9 codes, `XaiModelClient`, and the model-backed mapper and item writer. Off limits until they finish: `server/compiler/sources/**`, `script/snapshot.ts`, `snapshots/**`, `fallbackMap.ts`, and any xAI client files.

This session owns the cite-only public export, the graph-node API, extra licence/auditor/planner tests, and merge-prep. Work happens on `engineer-1/cite-only-export` in a separate worktree branched from `5a85619`, so the unpushed snapshot commit on `engineer-1/deterministic-stages` is neither rewritten nor force-pushed.

Rejected: continuing on the same checkout as the snapshot work. Those files are in flight.

## 2026-08-15 11:45: Demo UI reads persisted /graph and /export, not the raw compile body

The compile handle already stored runs in process memory, so POST /api/compile plus GET /graph and GET /export were enough. The missing demo slice was a clickable graph and a cite-only-safe citations panel. Engineer 2's client directory was unowned, so this session took it. The export panel filters quotes again in the UI so a leaked cite-only body cannot reach the projector.

Rejected: wiring XaiModelClient or waiting for official AC9 re-keying before the graph is clickable. The deterministic fallback already produces a full bundle a judge can click.

## 2026-08-15 11:53: Merge keeps both client slices

`engineer-2/interface` now includes Engineer 1's clickable graph and cite-only export panel. Transfer strip, coverage, refusal, and fixture fallback stay. Frozen transfer cards do not invent a graph: they clear `/graph` and `/export` because those runs are not in the server store.

Rejected: dropping the graph panel to avoid touching Engineer 1's client files. Both demo beats need to ship.

## 2026-08-15 12:05: Standards are read from a hashed snapshot, never authored by anything

The mapper is a model call, and the model is never asked what the curriculum says. It is asked how the curriculum
decomposes. `catalogueFromSnapshot` supplies every `StandardNode` — the official `AC9M7*` code verbatim, the authority's
own wording, and an evidence span that is the content description itself — and the stage attaches ids, evidence and
confidence by code after the call returns. A standard code the model invents is dropped and counted; a dangling edge is
dropped rather than repaired; confidence is computed from span matches rather than self-reported.

The demo request now compiles `AC9M7N04`, `AC9M7N08` and `AC9M7M06` instead of the three invented `SAMPLE-Y7-N-0x`
placeholders. Handover on `fallbackMap.ts` was taken to re-key it; its knowledge components, edges and misconceptions
are unchanged, because that pedagogy was good and only the standards layer was fictional.

Rejected: leaving the placeholders in place because they parsed. A bundle whose nodes cite `SAMPLE-Y7-N-01` fails the
one claim this project makes.

## 2026-08-15 12:05: A registered jurisdiction is not a supported one

An adapter that resolves a stage ladder but has no fetched curriculum used to fall through to the generic map, which
emitted invented standards under an official authority's name. That is the fake bundle the whole system exists to
refuse, so `curriculumReadiness` now blocks it: the run refuses with `unresolved_adapter`, names the missing snapshot and
licence, and ships a four-step collection plan.

This is what the transfer cases are. `us-tx` (Texas, grades) and `in` (NCERT, a stage-and-class ladder) are registered
with real stage ladders and no curriculum snapshot, so they prove the schema does not care what a stage is called while
refusing to pretend they are supported. `Year 6` refuses for the same reason on the live jurisdiction. The real transfer
is `Year 8`, which has its own fetched snapshot and compiles through the same engine against `AC9M8*` codes.

`check:source.standards-fetched` joins the source-check set in the evidence gate, so these refuse at AMBER rather than
shipping a YELLOW draft. A refusal at YELLOW would render to the client as a draft.

Rejected: precomputing frozen bundles for Texas and India. The handoff is explicit that a case which will not compile
becomes a documented refusal rather than a fake bundle.

## 2026-08-15 12:05: Low reasoning effort for both generative stages

`grok-4.6` at default effort took over 90 seconds on the mapper prompt and timed out. At `reasoning_effort: "low"` the
mapper answers in about 25 seconds and the item writer in about 19, and the output is a decomposition a teacher would
recognise. These stages are structured decomposition and item writing, not open-ended reasoning, and a stage that times
out helps nobody. Ten live runs finished 10/10 at roughly 49 seconds each, inside the 180 second AC-1 budget.

Span matching also had to learn one thing: a snapshot whose bytes are JSON holds its text escaped, so a content
description containing LaTeX appeared as `\\(` and a real citation was reported unsupported. The matcher now retries in
the snapshot's own encoding, which widens a match by exactly one re-encoding of the same characters and never by fuzzy
matching. All 30 Year 7 content descriptions span-match.

## 2026-08-15 12:20: Merge-bugfixes after Engineer 2 landed

The compiler never sets status to published. Frozen transfer cards no longer write a fixture run id into the load box. Pipeline stage colour treats a later success as a pass so a mapper that abstains then falls back does not stay amber. Provenance hover hides cite-only spans.

Rejected: waiting for cubic/greptile comments. Neither tool is reviewing this repo yet.

## 2026-08-15 12:45: Frozen strip fixtures are compiled, never authored

`npm run demo-fixtures` runs the real compiler and writes a file only if it parses against `CompilationResult`. That is
the same rule the compiler follows, applied to the artifacts a judge sees when the network is hostile. Refusals run on
`MockModelClient`, since a refusal never reaches a generative stage and the output stays byte-reproducible; successful
compiles use whatever client the environment provides, so with a key the frozen cards show real generated items.

The strip gained a Year 8 card and lost its placeholders. `client/src/fixtures/compilation-result.json` and
`agent-events.json` shipped with the scaffold as hand-written samples citing `SAMPLE-Y7-N-01`, which put invented
standards on the same strip as the honest cases; they are compiled now. Only the client copies changed. The canonical
`fixtures/` at the repo root are pinned by five test files and were left alone.

Case B, US K-2 foundational reading, is deliberately not written. No fetched source, no registered adapter, so the only
honest artifact would be an invented one and the card stays disabled.

Rejected: hand-editing a weak run into a better-looking fixture. When the Year 8 card came back with one item, the fix
was in the pipeline, not in the JSON.

## 2026-08-15 12:45: The item writer resolves short ids instead of discarding them

A real Year 7 run wrote six items and kept two: four were discarded because the model returned `unit-rate` where the
graph declared `kc:au.year-7.mathematics.unit-rate`. Models shorten long prefixed ids, and the mapper already handled
that with slug resolution while the item writer did not. The writer now matches a reference on the full id or on its
unambiguous trailing slug, for both component tags and distractor misconception links.

This is a lookup, not a leniency. A reference that names nothing the graph declares still resolves to undefined, and the
item is still discarded or the distractor still left unlinked for the validator to reject. The item count is also stated
to the model as arithmetic — "write exactly N items, one for each of the N components" — because asking for one per
component and listing them returned a single item for a seven-component graph, which then failed standards coverage.

## 2026-08-15 12:45: The gate summary names what was compiled

The summary was the hardcoded string "Prototype bundle built from sample standards", which stopped being true when the
snapshot store landed. It now names the authority and the number of content descriptions and says they are traced to a
content-hashed snapshot. `missingEvidence` no longer lists fetched content descriptions as missing, because they are
computed from the manifest rather than asserted.

The second half of the summary is unchanged and stays unchanged: describing provenance accurately is not the same as
claiming the bundle works, and this run has earned the first and not the second.
## 2026-08-15 12:35: Judge-path copy matches the live ACARA compile

Walking live compile → node click → citations → D-frozen → Refusal showed the intake still listing SAMPLE-Y7 checkboxes, the gate still saying "sample standards", and the refusal card leaving the live pipeline events on screen. Intake now offers AC9M7N04/N08/M06, the gate summary names hashed snapshots when sources are fetched, and a transfer card without its own events clears the pipeline.

Rejected: leaving the SAMPLE checkboxes because submit still sent the real ids. Judges read the form, not the request body.

## 2026-08-15 12:40: Public export cites only sources the run used

The snapshot store holds Year 7 and Year 8. A Year 7 compile was listing the Year 8 curriculum in the export and artifact source list. Citations now come from evidence on the graph, lessons and items. A refusal with no artifacts still exports the full manifest so observing stays allowed.

Rejected: hiding Year 8 only in the client. The public export is the artifact that may leave the box.

## 2026-08-15 13:30: A backtest found the Texas card citing the Australian licence page

Six live compiles against grok-4.6, checked against written pass rules. Five behaved. The Texas refusal cited
`src:acara.v9.terms`, whose title is "Australian Curriculum: copyright and terms of use", so the citations panel on the
Texas card read as though Texas had been compiled from ACARA.

The cause was a placeholder of mine. `SourceManifest` requires at least one source on every result including a refusal,
and the transfer adapters had nothing fetched, so they were pointed at the ACARA terms page to satisfy the minimum.
`JURISDICTION_NEUTRAL_SOURCE_IDS` replaces that: the IES guides and Rosenshine, which belong to no jurisdiction and are
the pedagogical evidence the sequence planner cites whatever curriculum is being compiled.

Rejected: emptying the citation list for any refused run. That reads well for Texas and badly everywhere else — it also
strips the Australian exam-emulation refusal, where the licence gate really did evaluate those sources, and it
contradicts the export test that a refused compile still exports attributed citations. The fix belonged at the source,
not at the presentation layer.

Also rejected: fetching TEKS to make the problem disappear. That is a real second jurisdiction and a separate piece of
work, not a way to dodge a bad manifest.

## 2026-08-15 13:30: The item writer's slug resolver was first-writer-wins

Pinned with unit tests, then fixed. The resolver accepts a shortened id because models return `unit-rate` where the
graph declares `kc:au.year-7.mathematics.unit-rate`, and discarding those threw away four of six items on a real run.
Its comment claimed it only claimed a bare slug when unambiguous; the code kept whichever id was seen first, so with
`kc:au.year-7.mathematics.unit-rate` and `kc:au.year-8.mathematics.unit-rate` the answer depended on declaration order.

An ambiguous reference now resolves to undefined. Guessing between two components would silently mis-tag an item, and a
mis-tagged item still counts toward standards coverage, which makes it worse than a discarded one. An exact id still
resolves even when its tail is ambiguous.

## 2026-08-15 13:30: The reliability score does not measure what the demo needs

`npm run reliability` passes a run when it returns a schema-valid bundle *or* a schema-valid refusal. A Year 7 compile
that ships zero items and rejects its only one is schema-valid, so it counts. The score was 10 of 10 in the same session
where a live Year 7 compile shipped nothing.

Five sampled live Year 7 compiles, same request each time:

| run | components | written | discarded | shipped | rejected | coverage | verdict |
|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 7 | 6 | 0 | 5 | 1 | pass | YELLOW |
| 2 | 6 | 5 | 0 | 5 | 0 | pass | BLUE |
| 3 | 7 | 6 | 0 | 3 | 3 | pass | YELLOW |
| 4 | 6 | 2 | 3 | 0 | 2 | **fail** | YELLOW |
| 5 | 7 | 6 | 0 | 3 | 3 | pass | YELLOW |

So four of five satisfied standards coverage and one shipped no items at all, plus a sixth zero-item run observed in the
backtest itself. Shipped counts range from 0 to 5 for the same request. The gates behave correctly throughout — run 4
failed coverage rather than pretending, which is the system working — but "10 of 10 reliable" and "the demo will show
items" are different claims, and only the first is currently measured.

Two things are worth separating. Rejections are the gates doing their job and should stay visible. Discards are items
the writer produced and the compiler dropped before validation, and run 4 lost three that way. The discard counter does
not record *why*, so attributing run 4 needs instrumentation that does not exist yet: the candidates are a component
reference that resolves to nothing, an option count outside three or four, and a payload that fails `QuestionItem`.

The frozen fixtures are guarded properly — `tests/demoFixtures.test.ts` requires the Year 8 card's coverage check to
pass, and it caught and blocked a one-item Year 8 fixture during this pass. The live path has no equivalent floor.
Recorded here rather than fixed, because a stop condition on item count is pipeline work and this pass was scoped to
tests and fixes. The cheapest next step is breaking the discard counter out by reason, which turns the next occurrence
from a guess into a reading.

## 2026-08-15 13:06: Vercel serves the Vite build and one Express function

The demo URL is a Vite static output plus `api/index.ts` wrapping the same Express routes as local `npm start`. All `/api/*` traffic hits one isolate so compile, SSE, graph and export share the process-local run store. `maxDuration` is 300 seconds because a live grok compile can exceed the hobby default. `XAI_API_KEY` stays a Vercel env var, never a file in the repo.

Rejected: deploying the bundled `dist/index.cjs` as a long-running listen server. Vercel does not give us a persistent process, and the CDN should serve the client.

The first production isolate failed with `ERR_MODULE_NOT_FOUND` for `server/app` because Vercel compiled `api/index.ts` without emitting the rest of the TypeScript graph. The function now loads an esbuild ESM bundle (`dist/function.js`) so path aliases and JSON snapshots are resolved at build time.

## 2026-08-15 13:50: Learner chrome is one Kenney 16px pack, CC0 only

When compile opens the kid phone, UI tiles come from Kenney Pixel UI Pack only: 16px 9-slice panels and buttons under
`client/public/kenney/pixel-ui`. CC0, commercial use fine, no attribution required. A Kenney.nl credit is still shown
because it costs nothing. The spritesheet was not vendored so crossed-swords and other combat icons never enter a
Year 7–8 product. No 32px mix, no itch.io / CraftPix / OpenGameArt / game-icons.net in this pass — those stay a later
sourcing order if we need a mascot, and game-icons.net would force a credits page (CC-BY).

Rejected: mixing packs for personality on demo day. Grid and palette consistency matters more than variety, and
CC-BY-NC / personal-use packs are unsafe if a school ever pays.

## 2026-08-15 14:00: GitHub topic/pixelart is not the kid pack

https://github.com/topics/pixelart is mostly CryptoPunks (24px), fantasy consoles, and combat games. The one
CC0 icon repo on that topic (`tstamborski/pixelart-icons`) is a different grid and palette. Pulling it would
stitch the Kenney 16px classroom. Personality instead comes from a 16px mascot we drew (Pip) on the Kenney
greens/yellows, Pixelify Sans on labels only, and a finish burst. Still no XP, no score, no swords.

Rejected: dropping a GitHub pixel-art repo into the phone for demo-day fun.

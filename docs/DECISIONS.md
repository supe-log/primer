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

## 2026-08-15 11:30: Deterministic fallback stages sit beside the snapshot store

Engineer 1 split: live ACARA fetch and the snapshot store stay in `server/compiler/sources/`. The complementary slice is the licence policy engine, the graph auditor's two-pass repair and abstain path, and a deterministic sequence planner plus item bank used when the model client abstains. The orchestrator calls those stages instead of replaying fixture artifacts, so MockModelClient still produces a full bundle and a rejected item still ships with a stated reason.

Rejected: waiting for the xAI client before replacing fixture replay. The handoff says the deterministic half is the stage fallback and the part a judge can verify.

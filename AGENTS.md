# Repository conventions

Primer Compiler. A hackathon scaffold, built to let two engineers work in parallel without merge conflicts.

Read `ENGINEERING_HANDOFF.md` before changing anything. Product decisions live there.

## Directory ownership

| Path | Owner | Rule |
|---|---|---|
| `shared/contracts/**` | Joint, frozen at `0.1.0` | Change only through the process in `docs/SCHEMA_CHANGELOG.md` |
| `fixtures/**` | Engineer 1 writes, Engineer 2 reads | Every fixture must parse against the contracts |
| `server/compiler/**` | Engineer 1 | Orchestration, adapters, model client, validators, gate |
| `server/routes.ts`, `server/index.ts` | Engineer 1 | Thin. No pipeline logic in a route |
| `server/vite.ts`, `server/static.ts` | Template files | Leave alone |
| `client/src/**` | Engineer 2 | Components, styling, state |
| `tests/contracts.test.ts` | Joint | |
| `tests/validators.test.ts`, `tests/compiler.test.ts` | Engineer 1 | |
| `docs/**`, `AGENTS.md`, `.cursor/rules/**` | Either, append only | Do not rewrite someone else's section |

One file, one owner. Ask before editing a file you do not own. Never reformat a file you do not own.

## Architecture rules

- **`shared/contracts` is the only seam between server and client.** Import from `@contracts`, never deep import a
  contract file from application code.
- **The compiler exposes two operations: `compile` and `observe`.** Adapters, validators, critics and gate arithmetic stay
  private to `server/compiler`. If a caller needs to reach inside, the interface is the wrong shape.
- **Agents judge, code decides.** Anything countable, checkable or arithmetical is deterministic code. Gate arithmetic,
  graph properties, coverage, key uniqueness, loop counters and permission tiers are never model decisions.
- **Deterministic validators run before any model judgement,** and they are blocking.
- **Abstention is a result.** Return null with an abstained flag. Never a fake zero, never a silent pass.
- **Nothing auto publishes.** `approvedByHuman` is always false out of the compiler.
- **A refused request is a normal return value,** not an exception. Status refused plus a refusal report with missing
  evidence and a collection plan.
- **Bounded loops.** Two revision passes maximum, then mark needs human review.
- **Every artifact carries `schemaVersion` and stable prefixed ids** (`req:`, `run:`, `src:`, `std:`, `kc:`, `mc:`,
  `unit:`, `lesson:`, `item:`, `check:`, `agent:`).

## Hard rules

- **No student personal information anywhere.** No names, dates of birth, emails, photos or student identifiers, in any
  schema, fixture, log or form field. A deterministic validator scans for these and hard blocks.
- **No `localStorage`, `sessionStorage`, `indexedDB` or cookies.** They are blocked in the sandboxed preview iframe and
  will crash the page. Use React state.
- **No secrets in the repository.** `.env.example` holds placeholder names only.
- **Cite only sources are never reproduced in an export.** Citation, link and attribution text only.
- **No claim of learning gains, calibration, fairness or jurisdiction support** in code comments, UI copy or the
  submission. Those need a pilot, response data, a review process and a per jurisdiction gate report.

## Code style

- TypeScript strict. No `any` in a contract or a public interface.
- Functions return values rather than mutating inputs. Accept dependencies rather than constructing them, which is why
  the compiler takes a `ModelClient` and a clock.
- Comments explain why, not what. Document invariants and error modes at the interface, since a caller has to know them.
- Prefer adding a file over restructuring one, especially under time pressure.
- Add `data-testid` to interactive elements and to elements that display meaningful values.

## Commands

```bash
npm run dev      # Express plus Vite on port 5000
npm run check    # typecheck
npm test         # Vitest
npm run build    # production build
npm run verify   # check, test, build
```

Run `npm run verify` before every integration checkpoint and paste the result in the shared channel.

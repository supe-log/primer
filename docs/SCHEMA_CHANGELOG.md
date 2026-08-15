# Schema changelog

`shared/contracts` is the shared seam between the compiler and the interface. It is frozen at `SCHEMA_VERSION` 0.1.0 for
the hackathon.

Freezing is not a claim that the schemas are right. It is a claim that changing them has a known cost, so a change should
be deliberate rather than accidental.

## The change process, all five steps, in order

1. **Bump the version** in `shared/contracts/version.ts`. Patch for an added optional field or a relaxed constraint.
   Minor for a new required field, a rename, or a tightened constraint.
2. **Update every fixture** in `fixtures/` so it still parses. A fixture that no longer parses is a broken contract, not
   a broken fixture.
3. **Update or add a contract test** in `tests/contracts.test.ts` covering the new invariant. A schema change with no test
   is not done.
4. **Add an entry below**: version, time, who, what changed, why, and what each engineer must do about it.
5. **Get an explicit written acknowledgment from both engineers** before the change lands. "Acknowledged, my side is
   updated" or "Acknowledged, I need ten minutes." Silence is not acknowledgment.

**After the 1:15 PM scope freeze, do not change a contract.** Add an optional field, carry the value in an existing free
text field, or hardcode it in the demo. A contract change after freeze risks the submission for a detail no judge will
notice.

---

## 0.1.0, 2026-08-15, initial freeze

Initial contract set, written from the research report's artifact model.

Contracts included:

- `CompilationRequest` with `LearnerContext` and `AssessmentTarget`.
- `SourceManifest`, `SourceSnapshot`, `SourceLicence`, `EvidenceReference`.
- `KnowledgeComponent`, `PrerequisiteEdge`, `Misconception`, `StandardNode`, `CurriculumGraph`.
- `CoursePlan`, `Unit`, `Lesson`, `WorkedExample`, `SequencingDecision`.
- `QuestionItem` with `ItemOption` and `ItemDifficulty`.
- `GateCheck`, `GateReport`.
- `AgentEvent`.
- `RunManifest`, `ModelCallRecord`.
- `CompilationResult`, `RefusalReport`.

Notable decisions baked into 0.1.0:

- Stage is an object with a local label, an age band and an internal ordinal. There is no bare grade integer anywhere,
  because a grade number does not survive a border crossing.
- There is no student personal information field, and adding one is a contract change requiring this process.
- `GateCheckStatus` includes `abstain` as a first class value, distinct from `fail` and `skipped`.
- `CompilationResult.approvedByHuman` is a literal `false`. Publication is a human act outside the compiler.
- `CompilationResult` uses one shape with a `status` discriminator plus a cross field refinement, so a refused result
  cannot carry artifacts and a draft result cannot omit them.
- `QuestionItem.difficulty.calibrated` and `difStatus` exist from day one so uncalibrated items are labelled rather than
  implied.
- Items keep their `rejection` reason and still ship in the result, because the rejections are the proof the gates ran.

Engineer actions: none. This is the baseline both sides build against.

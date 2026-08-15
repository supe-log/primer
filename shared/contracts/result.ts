import { z } from "zod";
import { CompilationRequest } from "./request";
import { SourceManifest } from "./source";
import { CurriculumGraph } from "./graph";
import { CoursePlan } from "./course";
import { QuestionItem } from "./items";
import { GateReport } from "./gate";
import { RunManifest } from "./run";
import { RunId, schemaVersionField } from "./primitives";

/**
 * CompilationResult is everything the compiler hands back. One shape covers the
 * published, draft and refused paths so the client never branches on a missing key
 * without a status to explain it.
 *
 * Invariants:
 *  - status "refused" requires `refusal` and forbids `graph`, `coursePlan` and items.
 *  - status "draft" and "published" require `graph`, `coursePlan` and `items`.
 *  - `gateReport.verdict` agrees with status: RED and AMBER refuse, YELLOW is a
 *    draft, BLUE and GREEN are publishable but still await human approval.
 *  - `items` includes rejected items with their rejection reason. A rejected item is
 *    visible, not deleted, because the rejections are the proof the gates ran.
 *  - There is no auto-publish path. `approvedByHuman` is always false out of the compiler.
 */

export const CompilationStatus = z.enum(["published", "draft", "refused"]);
export type CompilationStatus = z.infer<typeof CompilationStatus>;

export const RefusalReport = z.object({
  /** Machine-readable reason so the UI can route without string matching. */
  code: z.enum([
    "missing_blueprint",
    "unlicensed_source",
    "unresolved_adapter",
    "graph_unsound",
    "safety_block",
  ]),
  /** What was requested, in the author's terms. */
  requested: z.string().min(1),
  /** Named evidence that is missing. Never a vague apology. */
  missingEvidence: z.array(z.string().min(1)).min(1),
  /** How to obtain the missing evidence. A refusal always ships a collection plan. */
  collectionPlan: z.array(z.string().min(1)).min(1),
});
export type RefusalReport = z.infer<typeof RefusalReport>;

export const CompilationResult = z
  .object({
    schemaVersion: schemaVersionField,
    runId: RunId,
    status: CompilationStatus,
    request: CompilationRequest,
    sourceManifest: SourceManifest,
    graph: CurriculumGraph.optional(),
    coursePlan: CoursePlan.optional(),
    items: z.array(QuestionItem).default([]),
    gateReport: GateReport,
    runManifest: RunManifest,
    refusal: RefusalReport.optional(),
    /** Always false from the compiler. Publication is a human act outside this code. */
    approvedByHuman: z.literal(false),
  })
  .superRefine((value, ctx) => {
    if (value.status === "refused") {
      if (!value.refusal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a refused result must carry a refusal report",
          path: ["refusal"],
        });
      }
      if (value.graph || value.coursePlan || value.items.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a refused result must not carry generated artifacts",
          path: ["graph"],
        });
      }
      return;
    }

    if (!value.graph || !value.coursePlan) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a published or draft result requires a graph and a course plan",
        path: ["coursePlan"],
      });
    }
    if (value.items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a published or draft result requires at least one item",
        path: ["items"],
      });
    }
  });
export type CompilationResult = z.infer<typeof CompilationResult>;

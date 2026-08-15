import { z } from "zod";
import { Locale, RequestId, Stage, StandardId, schemaVersionField } from "./primitives";

/**
 * CompilationRequest is the only input to the compiler.
 *
 * Invariants:
 *  - No student personal information. There is no name, date of birth, email,
 *    photo or student identifier field anywhere in this contract, and adding one
 *    is a schema change that requires the process in docs/SCHEMA_CHANGELOG.md.
 *  - `standardIds` is a selection from a snapshot, never free text. Free-text
 *    standards are disabled so every artifact stays traceable.
 *  - `assessmentTarget: "official_exam_emulation"` requires a fetched blueprint.
 *    Without one, the compiler refuses before generating anything.
 */

export const AssessmentTarget = z.enum(["none", "unit_test", "official_exam_emulation"]);
export type AssessmentTarget = z.infer<typeof AssessmentTarget>;

export const LearnerContext = z.object({
  /** Free-text notes about prior knowledge. Describes the class, never a named child. */
  priorKnowledgeNotes: z.string().max(1000).default(""),
  /** Minutes of learning time available per day. Bounds the compile. */
  dailyMinutes: z.number().int().min(5).max(240).default(30),
  /** UDL-style accommodations requested, as free text tags. */
  accessibilityNeeds: z.array(z.string().min(1)).default([]),
});
export type LearnerContext = z.infer<typeof LearnerContext>;

export const CompilationRequest = z.object({
  schemaVersion: schemaVersionField,
  requestId: RequestId,
  jurisdictionId: z.string().min(1),
  curriculumSourceId: z.string().min(1),
  stage: Stage,
  subject: z.string().min(1),
  standardIds: z.array(StandardId).min(1).max(8),
  locale: Locale,
  goal: z.string().min(1).max(400),
  learnerContext: LearnerContext,
  assessmentTarget: AssessmentTarget,
  lessonCount: z.number().int().min(1).max(12),
});
export type CompilationRequest = z.infer<typeof CompilationRequest>;

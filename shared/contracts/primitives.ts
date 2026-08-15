import { z } from "zod";
import { SCHEMA_VERSION } from "./version";

/**
 * Shared primitives. Everything in this file is deliberately boring: stable IDs,
 * enumerations that gates and UI both switch on, and the schemaVersion stamp.
 */

/** Every persisted artifact carries the contract version it was written against. */
export const schemaVersionField = z.literal(SCHEMA_VERSION);

/**
 * Stable, human-readable, prefixed IDs. IDs are part of the contract: they are
 * referenced across artifacts (an item points at a knowledge component id, a
 * lesson points at unit and KC ids), so they must be stable within a run and
 * reproducible across replays of the same fixture.
 */
export const idPattern = (prefix: string) =>
  z
    .string()
    .regex(
      new RegExp(`^${prefix}:[a-z0-9][a-z0-9._\\-]*$`),
      `expected an id of the form "${prefix}:some.stable.slug"`,
    );

export const RequestId = idPattern("req");
export const RunId = idPattern("run");
export const SourceId = idPattern("src");
export const KnowledgeComponentId = idPattern("kc");
export const MisconceptionId = idPattern("mc");
export const StandardId = idPattern("std");
export const UnitId = idPattern("unit");
export const LessonId = idPattern("lesson");
export const ItemId = idPattern("item");
export const CheckId = idPattern("check");
export const AgentId = idPattern("agent");

export const IsoDateTime = z.string().datetime({ offset: true });
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase sha-256 hex digest");

/** Placeholder digest for prototype fixtures that were not fetched from a live source. */
export const SAMPLE_DIGEST = "0".repeat(64);

/**
 * Gate vocabulary, carried over from the writing-engine's evidence gates.
 * RED and AMBER refuse. YELLOW ships a draft that needs human review.
 * BLUE and GREEN ship a bundle, still behind explicit human approval.
 */
export const GateVerdict = z.enum(["RED", "AMBER", "YELLOW", "BLUE", "GREEN"]);
export type GateVerdict = z.infer<typeof GateVerdict>;

/** Permission tiers are earned one at a time. The ceiling is the last gate fully passed. */
export const PermissionTier = z.enum([
  "investigate",
  "prototype",
  "controlled_pilot",
  "operate_autonomously",
]);
export type PermissionTier = z.infer<typeof PermissionTier>;

/** What the source licence permits. Enforced in code at export time, not by a prompt. */
export const LicencePosture = z.enum(["redistributable", "cite_only", "unknown"]);
export type LicencePosture = z.infer<typeof LicencePosture>;

/** Cognitive demand band for an item. Distribution is measured, never assumed. */
export const DemandBand = z.enum(["recall", "apply", "analyze"]);
export type DemandBand = z.infer<typeof DemandBand>;

/** Formative practice and exam emulation are different products with different gates. */
export const ItemPurpose = z.enum(["formative", "test_emulation"]);
export type ItemPurpose = z.infer<typeof ItemPurpose>;

/** Language support tier. A low-tier language can never inherit English's verdict. */
export const ResourceTier = z.enum(["high", "mid", "low"]);
export type ResourceTier = z.infer<typeof ResourceTier>;

/**
 * Confidence is computed by code from span matches, validator pass rates and
 * critic agreement. It is never a model self-rating. Anything not measured is
 * listed in `unmeasured` rather than silently defaulted.
 */
export const Confidence = z.object({
  value: z.number().min(0).max(1),
  basis: z.array(z.string().min(1)),
  unmeasured: z.array(z.string().min(1)),
});
export type Confidence = z.infer<typeof Confidence>;

/** Locale is structural, not cosmetic: it drives script, numerals, units and currency. */
export const Locale = z.object({
  bcp47: z.string().min(2),
  script: z.string().min(4),
  numeralSystem: z.string().min(3).default("latn"),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  resourceTier: ResourceTier,
});
export type Locale = z.infer<typeof Locale>;

/**
 * Stage never keys on a bare grade integer. "Year 7" is an Australian fact,
 * "Grade 4" a Texas one, and Kenya's ladder does not line up with either.
 */
export const Stage = z.object({
  localLabel: z.string().min(1),
  ageBand: z.tuple([z.number().int(), z.number().int()]),
  ordinal: z.number().int().min(0),
});
export type Stage = z.infer<typeof Stage>;

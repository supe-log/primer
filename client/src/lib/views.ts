import { z } from "zod";
import {
  CompilationStatus,
  Confidence,
  GateVerdict,
  KnowledgeComponentId,
  LicencePosture,
  PermissionTier,
  RefusalReport,
  RunId,
  SourceId,
  StandardId,
  schemaVersionField,
} from "@contracts";

/**
 * Presentation payloads from GET /graph and GET /export. These are not frozen
 * 0.1.0 contracts: they are cite-only-safe views the UI may render. Parsing them
 * here keeps a shape change loud instead of a blank panel.
 */

export const GraphNodeView = z.object({
  id: KnowledgeComponentId,
  label: z.string().min(1),
  description: z.string().min(1),
  standardIds: z.array(StandardId),
  prerequisiteOnly: z.boolean(),
  atomicEntry: z.boolean(),
  confidence: Confidence,
});
export type GraphNodeView = z.infer<typeof GraphNodeView>;

export const GraphEdgeView = z.object({
  from: KnowledgeComponentId,
  to: KnowledgeComponentId,
  justification: z.string().min(1),
});
export type GraphEdgeView = z.infer<typeof GraphEdgeView>;

export const GraphStandardView = z.object({
  standardId: StandardId,
  sourceCode: z.string().min(1),
  statement: z.string().min(1),
});
export type GraphStandardView = z.infer<typeof GraphStandardView>;

export const GraphView = z.object({
  schemaVersion: schemaVersionField,
  runId: RunId,
  jurisdictionId: z.string().min(1),
  nodes: z.array(GraphNodeView),
  edges: z.array(GraphEdgeView),
  standards: z.array(GraphStandardView),
  stats: z.object({
    nodes: z.number().int().min(0),
    edges: z.number().int().min(0),
    belowStage: z.number().int().min(0),
    atomicEntry: z.number().int().min(0),
  }),
});
export type GraphView = z.infer<typeof GraphView>;

export const PublicSourceCitation = z.object({
  sourceId: SourceId,
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),
  attributionText: z.string().min(1),
  posture: LicencePosture,
  quotedText: z.string().min(1).optional(),
});
export type PublicSourceCitation = z.infer<typeof PublicSourceCitation>;

export const PublicExportBundle = z.object({
  schemaVersion: schemaVersionField,
  runId: RunId,
  status: CompilationStatus,
  citations: z.array(PublicSourceCitation),
  alignment: z.object({
    requestedStandardIds: z.array(StandardId),
    mappedStandardIds: z.array(StandardId),
    assessedStandardIds: z.array(StandardId),
    coverageOk: z.boolean(),
  }),
  course: z
    .object({
      title: z.string().min(1),
      lessons: z.array(
        z.object({
          lessonId: z.string().min(1),
          title: z.string().min(1),
          objective: z.string().min(1),
          introducesKnowledgeComponentIds: z.array(KnowledgeComponentId),
          reviewsKnowledgeComponentIds: z.array(KnowledgeComponentId),
        }),
      ),
    })
    .optional(),
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      stem: z.string().min(1),
      standardIds: z.array(StandardId),
      knowledgeComponentIds: z.array(KnowledgeComponentId),
      correctOptionId: z.string().min(1),
      rejected: z.boolean(),
      rejectionReason: z.string().min(1).optional(),
    }),
  ),
  gate: z.object({
    verdict: GateVerdict,
    permission: PermissionTier,
    summary: z.string().min(1),
    missingEvidence: z.array(z.string().min(1)),
    unmeasured: z.array(z.string().min(1)),
  }),
  refusal: RefusalReport.optional(),
  licence: z.object({
    redistributableSourceIds: z.array(SourceId),
    citeOnlySourceIds: z.array(SourceId),
    strippedSourceIds: z.array(SourceId),
  }),
});
export type PublicExportBundle = z.infer<typeof PublicExportBundle>;

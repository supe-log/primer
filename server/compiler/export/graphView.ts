import type { Confidence, CurriculumGraph } from "@contracts";

/**
 * Graph presentation for the UI. Nodes and edges only: no snapshot bodies, no
 * quoted spans. Engineer 2 can render this without reaching into compiler stages.
 */

export interface GraphNodeView {
  id: string;
  label: string;
  description: string;
  standardIds: string[];
  prerequisiteOnly: boolean;
  atomicEntry: boolean;
  confidence: Confidence;
}

export interface GraphEdgeView {
  from: string;
  to: string;
  justification: string;
}

export interface GraphStandardView {
  standardId: string;
  sourceCode: string;
  statement: string;
}

export interface GraphView {
  schemaVersion: "0.1.0";
  runId: string;
  jurisdictionId: string;
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  standards: GraphStandardView[];
  stats: {
    nodes: number;
    edges: number;
    belowStage: number;
    atomicEntry: number;
  };
}

export function buildGraphView(runId: string, graph: CurriculumGraph): GraphView {
  const nodes: GraphNodeView[] = graph.knowledgeComponents.map((kc) => ({
    id: kc.knowledgeComponentId,
    label: kc.label,
    description: kc.description,
    standardIds: kc.standardIds,
    prerequisiteOnly: kc.prerequisiteOnly,
    atomicEntry: kc.atomicEntry,
    confidence: kc.confidence,
  }));
  const edges: GraphEdgeView[] = graph.prerequisiteEdges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    justification: edge.justification,
  }));
  const standards: GraphStandardView[] = graph.standards.map((standard) => ({
    standardId: standard.standardId,
    sourceCode: standard.sourceCode,
    statement: standard.statement,
  }));

  return {
    schemaVersion: "0.1.0",
    runId,
    jurisdictionId: graph.jurisdictionId,
    nodes,
    edges,
    standards,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      belowStage: nodes.filter((node) => node.prerequisiteOnly).length,
      atomicEntry: nodes.filter((node) => node.atomicEntry).length,
    },
  };
}

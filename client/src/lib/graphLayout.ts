import type { GraphEdgeView, GraphNodeView, GraphStandardView, GraphView } from "./views";

/**
 * Deterministic layered layout for the knowledge graph. Roots (no incoming
 * edges) sit on the left; each node is one layer past its latest prerequisite.
 * Pure so the click-to-inspect contract can be tested without a browser.
 */

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;
export const LAYER_GAP = 56;
export const ROW_GAP = 28;
export const PAD_X = 24;
export const PAD_Y = 20;

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  layer: number;
  indexInLayer: number;
  node: GraphNodeView;
}

export interface GraphLayout {
  nodes: LaidOutNode[];
  width: number;
  height: number;
}

export function layerIndex(view: GraphView): Map<string, number> {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of view.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of view.edges) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const layers = new Map<string, number>();
  const queue = view.nodes.filter((node) => (incoming.get(node.id) ?? []).length === 0).map((node) => node.id);
  for (const id of queue) layers.set(id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const nextLayer = (layers.get(id) ?? 0) + 1;
    for (const child of outgoing.get(id) ?? []) {
      const current = layers.get(child);
      layers.set(child, current === undefined ? nextLayer : Math.max(current, nextLayer));
      const parents = incoming.get(child) ?? [];
      if (parents.every((parent) => layers.has(parent))) {
        queue.push(child);
      }
    }
  }

  for (const node of view.nodes) {
    if (!layers.has(node.id)) layers.set(node.id, 0);
  }
  return layers;
}

export function layoutGraph(view: GraphView): GraphLayout {
  const layers = layerIndex(view);
  const buckets = new Map<number, GraphNodeView[]>();
  for (const node of view.nodes) {
    const layer = layers.get(node.id) ?? 0;
    const bucket = buckets.get(layer) ?? [];
    bucket.push(node);
    buckets.set(layer, bucket);
  }

  const layerCount = Math.max(0, ...buckets.keys()) + 1;
  const tallest = Math.max(1, ...[...buckets.values()].map((bucket) => bucket.length));
  const width = PAD_X * 2 + layerCount * NODE_WIDTH + Math.max(0, layerCount - 1) * LAYER_GAP;
  const height = PAD_Y * 2 + tallest * NODE_HEIGHT + Math.max(0, tallest - 1) * ROW_GAP;

  const laid: LaidOutNode[] = [];
  for (const [layer, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const columnHeight = bucket.length * NODE_HEIGHT + Math.max(0, bucket.length - 1) * ROW_GAP;
    const offsetY = PAD_Y + (height - PAD_Y * 2 - columnHeight) / 2;
    bucket.forEach((node, indexInLayer) => {
      const x = PAD_X + layer * (NODE_WIDTH + LAYER_GAP);
      const y = offsetY + indexInLayer * (NODE_HEIGHT + ROW_GAP);
      laid.push({
        id: node.id,
        x,
        y,
        cx: x + NODE_WIDTH / 2,
        cy: y + NODE_HEIGHT / 2,
        layer,
        indexInLayer,
        node,
      });
    });
  }

  return { nodes: laid, width, height };
}

export interface NodeInspection {
  node: GraphNodeView;
  standards: GraphStandardView[];
  incoming: GraphEdgeView[];
  outgoing: GraphEdgeView[];
}

export function inspectNode(view: GraphView, nodeId: string): NodeInspection | undefined {
  const node = view.nodes.find((entry) => entry.id === nodeId);
  if (!node) return undefined;
  const standards = view.standards.filter((standard) => node.standardIds.includes(standard.standardId));
  return {
    node,
    standards,
    incoming: view.edges.filter((edge) => edge.to === nodeId),
    outgoing: view.edges.filter((edge) => edge.from === nodeId),
  };
}

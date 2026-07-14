// Shared graph utilities — used by Neo4j-backed entity services to convert
// Cypher row results into node/edge structures for network visualization.

export interface GraphNode {
  uuid: string;
  type: string;
  name?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  [key: string]: unknown;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build a { nodes, edges } graph from Cypher rows of shape
 * { root: Node, neighbor: Node, r: Relationship }.
 *
 * @param rows      – Raw Neo4j result rows (each with `.root`, `.neighbor`, `.r`).
 * @param rootAlias – Property name for the central/ego node (e.g. "p" or "l").
 * @param nodeTypes – A map of node UUID → display type string, for labeling.
 *                    If omitted, labels are determined heuristically.
 */
export function buildGraphFromRows(
  rows: Array<{ [key: string]: unknown }>,
  rootAlias: string,
  nodeTypes?: Map<string, string>,
): GraphData {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const row of rows) {
    const root = (row[rootAlias] ?? {}) as Record<string, unknown>;
    const neighbor = (row.neighbor ?? {}) as Record<string, unknown>;
    const rel = (row.r ?? {}) as Record<string, unknown>;

    if (root.uuid && typeof root.uuid === "string") {
      const type = nodeTypes?.get(root.uuid) ?? inferNodeType(root);
      nodes.set(root.uuid, {
        ...root,
        uuid: root.uuid,
        type,
        name: getDisplayName(root),
      } as GraphNode);
    }

    if (neighbor.uuid && typeof neighbor.uuid === "string") {
      const type = nodeTypes?.get(neighbor.uuid) ?? inferNodeType(neighbor);
      nodes.set(neighbor.uuid, {
        ...neighbor,
        uuid: neighbor.uuid,
        type,
        name: getDisplayName(neighbor),
      } as GraphNode);
    }

    if (
      rel.type &&
      typeof rel.type === "string" &&
      root.uuid &&
      neighbor.uuid
    ) {
      edges.push({
        source: root.uuid as string,
        target: neighbor.uuid as string,
        type: rel.type,
        ...rel,
      });
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

/**
 * Parse a Neo4j array-or-JSON-string property into a string[].
 * Handles Neo4j's convention of storing arrays as JSON strings.
 */
export function parseArrayProperty(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [value];
    } catch {
      return [value];
    }
  }
  return [];
}

// -- Helpers ---------------------------------------------------------------

/**
 * Infer a display type string from a Neo4j node.
 *
 * Priority:
 *   1. Neo4j labels (if available) — authoritative.
 *   2. Property-key heuristics — each entity type has a distinctive set of
 *      properties that rarely overlap.
 */
function inferNodeType(node: Record<string, unknown>): string {
  // Use Neo4j labels if available (authoritative)
  const labels = (node as any).labels;
  if (Array.isArray(labels) && labels.length > 0) {
    return String(labels[0]);
  }

  // Property-key heuristics ordered by specificity (most specific first)
  if (node.doi !== undefined) return "Paper";
  if (node.orcid !== undefined) return "Person";
  if (node.brand !== undefined || node.model !== undefined) return "Equipment";
  if (node.abbreviation !== undefined || node.keywords !== undefined) return "Lab";
  if (node.level !== undefined) return "ResearchDirection";
  if (node.country !== undefined && node.englishName !== undefined) return "University";

  return "Unknown";
}

/** Get the best display name from any entity node */
export function getDisplayName(node: Record<string, unknown>): string {
  return String(
    node.chineseName || node.name || node.englishName || node.title || node.uuid || 'Unknown'
  );
}

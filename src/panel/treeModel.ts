import type { SchemaNode } from "../analyzer/types";

export interface ChildGroup {
  property: string;
  nodes: SchemaNode[];
}

export interface TreeIndex {
  nodes: SchemaNode[];
  byIdOrNodeId: Map<string, SchemaNode>;
}

export function createTreeIndex(nodes: SchemaNode[]): TreeIndex {
  const byIdOrNodeId = new Map<string, SchemaNode>();
  for (const node of nodes) {
    if (!byIdOrNodeId.has(node.id)) {
      byIdOrNodeId.set(node.id, node);
    }
    if (node.nodeId !== undefined && !byIdOrNodeId.has(node.nodeId)) {
      byIdOrNodeId.set(node.nodeId, node);
    }
  }
  return { nodes, byIdOrNodeId };
}

export function treeRoots(index: TreeIndex): SchemaNode[] {
  const childIds = new Set<string>();
  for (const node of index.nodes) {
    for (const link of node.links) {
      const child = findLinkedNode(link.target, index);
      if (child !== undefined) {
        childIds.add(child.id);
      }
    }
  }
  return index.nodes.filter((node) => !childIds.has(node.id));
}

export function childGroups(
  node: SchemaNode,
  index: TreeIndex,
  ancestors: Set<string>,
  matches: (node: SchemaNode) => boolean,
): ChildGroup[] {
  const groups = new Map<string, SchemaNode[]>();
  for (const link of node.links) {
    const child = findLinkedNode(link.target, index);
    if (child === undefined || ancestors.has(child.id) || child.id === node.id || !matches(child)) {
      continue;
    }
    const group = groups.get(link.property) ?? [];
    if (!group.some((entry) => entry.id === child.id)) {
      group.push(child);
    }
    groups.set(link.property, group);
  }
  return Array.from(groups, ([property, groupNodes]) => ({ property, nodes: groupNodes }));
}

export function findLinkedNode(target: string, index: TreeIndex): SchemaNode | undefined {
  return index.byIdOrNodeId.get(target);
}

export function treeMatchesQuery(
  node: SchemaNode,
  index: TreeIndex,
  textMatches: (node: SchemaNode) => boolean,
  seen = new Set<string>(),
): boolean {
  if (seen.has(node.id)) {
    return false;
  }
  if (textMatches(node)) {
    return true;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(node.id);
  return node.links.some((link) => {
    const child = findLinkedNode(link.target, index);
    return child !== undefined && treeMatchesQuery(child, index, textMatches, nextSeen);
  });
}

import type { SchemaNode } from "../analyzer/types";

export interface ChildGroup {
  property: string;
  nodes: SchemaNode[];
}

export function treeRoots(nodes: SchemaNode[]): SchemaNode[] {
  const childIds = new Set<string>();
  for (const node of nodes) {
    for (const link of node.links) {
      const child = findLinkedNode(link.target, nodes);
      if (child !== undefined) {
        childIds.add(child.id);
      }
    }
  }
  return nodes.filter((node) => !childIds.has(node.id));
}

export function childGroups(
  node: SchemaNode,
  allNodes: SchemaNode[],
  ancestors: Set<string>,
  matches: (node: SchemaNode) => boolean,
): ChildGroup[] {
  const groups = new Map<string, SchemaNode[]>();
  for (const link of node.links) {
    const child = findLinkedNode(link.target, allNodes);
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

export function findLinkedNode(target: string, nodes: SchemaNode[]): SchemaNode | undefined {
  return nodes.find((node) => node.id === target || node.nodeId === target);
}

export function treeMatchesQuery(
  node: SchemaNode,
  allNodes: SchemaNode[],
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
    const child = findLinkedNode(link.target, allNodes);
    return child !== undefined && treeMatchesQuery(child, allNodes, textMatches, nextSeen);
  });
}

import type { FigmaNode } from "./types"

/** Index every node in a fetched Figma subtree by id (for INSTANCE_SWAP resolution). */
export function buildFigmaNodeIndex(root: FigmaNode): Map<string, FigmaNode> {
  const index = new Map<string, FigmaNode>()
  function walk(node: FigmaNode): void {
    index.set(node.id, node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return index
}

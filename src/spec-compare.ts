import type {
  SpecCompareBreadcrumb,
  SpecCompareResult,
  SpecCompareSiblingHint,
  SpecNode,
} from "./types"

interface MatchResult {
  node: SpecNode
  path: SpecCompareBreadcrumb[]
  siblingHint?: SpecCompareSiblingHint
}

export function compareSpecs(
  contextRoot: SpecNode,
  deltaRoot: SpecNode,
  contextRole = "context",
  deltaRole = "delta",
): SpecCompareResult {
  const deltaRootId = deltaRoot.figmaNodeId

  if (deltaRootId) {
    const idMatch = findById(contextRoot, deltaRootId)
    if (idMatch) {
      return {
        contextRole,
        deltaRole,
        deltaRootId,
        matched: true,
        confidence: "high",
        strategy: "figmaNodeId",
        path: idMatch.path,
        siblingHint: idMatch.siblingHint,
      }
    }
  }

  const fallbackMatch = findBySignature(contextRoot, buildSignature(deltaRoot))
  if (fallbackMatch) {
    return {
      contextRole,
      deltaRole,
      deltaRootId,
      matched: true,
      confidence: "low",
      strategy: "textAndComponentPath",
      path: fallbackMatch.path,
      siblingHint: fallbackMatch.siblingHint,
      message: "Matched by text/component signature because figmaNodeId was absent or not found.",
    }
  }

  return {
    contextRole,
    deltaRole,
    deltaRootId,
    matched: false,
    confidence: "none",
    strategy: "none",
    message: "Delta root was not found inside the context selection.",
  }
}

function findById(
  node: SpecNode,
  id: string,
  ancestors: SpecNode[] = [],
): MatchResult | undefined {
  if (node.figmaNodeId === id) return toMatchResult(node, ancestors)

  for (const child of node.children ?? []) {
    const match = findById(child, id, [...ancestors, node])
    if (match) return match
  }

  return undefined
}

function buildSignature(node: SpecNode): string | undefined {
  const text = firstText(node)
  if (!text) return undefined
  return `${componentPath(node).join(">")}|${text}`
}

function findBySignature(
  node: SpecNode,
  signature: string | undefined,
  ancestors: SpecNode[] = [],
): MatchResult | undefined {
  if (!signature) return undefined
  if (buildSignature(node) === signature) return toMatchResult(node, ancestors)

  for (const child of node.children ?? []) {
    const match = findBySignature(child, signature, [...ancestors, node])
    if (match) return match
  }

  return undefined
}

function toMatchResult(node: SpecNode, ancestors: SpecNode[]): MatchResult {
  const parent = ancestors[ancestors.length - 1]
  return {
    node,
    path: [...ancestors, node].map(toBreadcrumb),
    siblingHint: parent ? buildSiblingHint(parent, node) : undefined,
  }
}

function buildSiblingHint(
  parent: SpecNode,
  node: SpecNode,
): SpecCompareSiblingHint | undefined {
  const siblings = parent.children ?? []
  const index = siblings.indexOf(node)
  if (index < 0) return undefined

  return {
    index,
    count: siblings.length,
    before: index > 0 ? toBreadcrumb(siblings[index - 1]) : undefined,
    after: index < siblings.length - 1 ? toBreadcrumb(siblings[index + 1]) : undefined,
  }
}

function firstText(node: SpecNode): string | undefined {
  if (node.text?.trim()) return node.text.trim()
  for (const child of node.children ?? []) {
    const text = firstText(child)
    if (text) return text
  }
  return undefined
}

function componentPath(node: SpecNode, maxDepth = 4): string[] {
  const path = [node.component]
  let current = node.children?.[0]
  while (current && path.length < maxDepth) {
    path.push(current.component)
    current = current.children?.[0]
  }
  return path
}

function toBreadcrumb(node: SpecNode): SpecCompareBreadcrumb {
  return {
    component: node.component,
    figmaName: node.figmaName,
    figmaNodeId: node.figmaNodeId,
  }
}

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

interface ScoredMatchResult extends MatchResult {
  score: number
}

const HIGH_SIMILARITY_THRESHOLD = 0.82
const MEDIUM_SIMILARITY_THRESHOLD = 0.62
const LOW_SIMILARITY_THRESHOLD = 0.45
const SIZE_TOLERANCE_RATIO = 0.25

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
        score: 1,
        path: idMatch.path,
        siblingHint: idMatch.siblingHint,
      }
    }
  }

  const similarityMatch = findBestSimilarityMatch(contextRoot, deltaRoot)
  if (similarityMatch && similarityMatch.score >= LOW_SIMILARITY_THRESHOLD) {
    return {
      contextRole,
      deltaRole,
      deltaRootId,
      matched: true,
      confidence: confidenceForScore(similarityMatch.score),
      strategy: "structuralSimilarity",
      score: roundScore(similarityMatch.score),
      path: similarityMatch.path,
      siblingHint: similarityMatch.siblingHint,
      message: "Matched by structural similarity because figmaNodeId was absent or not found in the context selection.",
    }
  }

  return {
    contextRole,
    deltaRole,
    deltaRootId,
    matched: false,
    confidence: "none",
    strategy: "none",
    score: similarityMatch ? roundScore(similarityMatch.score) : undefined,
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

function findBestSimilarityMatch(
  node: SpecNode,
  delta: SpecNode,
  ancestors: SpecNode[] = [],
  best?: ScoredMatchResult,
): ScoredMatchResult | undefined {
  const score = similarityScore(node, delta)
  let currentBest = best
  if (!currentBest || score > currentBest.score) {
    currentBest = { ...toMatchResult(node, ancestors), score }
  }

  for (const child of node.children ?? []) {
    currentBest = findBestSimilarityMatch(child, delta, [...ancestors, node], currentBest)
  }

  return currentBest
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

function toBreadcrumb(node: SpecNode): SpecCompareBreadcrumb {
  return {
    component: node.component,
    figmaName: node.figmaName,
    figmaNodeId: node.figmaNodeId,
  }
}

function similarityScore(candidate: SpecNode, delta: SpecNode): number {
  const componentScore = candidate.component === delta.component ? 1 : 0
  const textScore = textSimilarity(collectTexts(candidate), collectTexts(delta))
  const propScore = keyValueSimilarity(
    flattenComparableValues(candidate.props),
    flattenComparableValues(delta.props),
  )
  const styleScore = keyValueSimilarity(
    flattenComparableValues(candidate.htmlOptions?.style),
    flattenComparableValues(delta.htmlOptions?.style),
  )
  const structureScore = multisetSimilarity(
    componentMultiset(candidate),
    componentMultiset(delta),
  )
  const dimensionScore = dimensionSimilarity(candidate, delta)

  return (
    componentScore * 0.22
    + textScore * 0.24
    + propScore * 0.18
    + styleScore * 0.12
    + structureScore * 0.18
    + dimensionScore * 0.06
  )
}

function collectTexts(node: SpecNode): string[] {
  const texts: string[] = []
  if (node.text?.trim()) texts.push(normalizeText(node.text))
  for (const child of node.children ?? []) texts.push(...collectTexts(child))
  return texts
}

function textSimilarity(candidateTexts: string[], deltaTexts: string[]): number {
  if (deltaTexts.length === 0) return 1
  if (candidateTexts.length === 0) return 0

  const candidateSet = new Set(candidateTexts)
  const exactMatches = deltaTexts.filter(text => candidateSet.has(text)).length
  if (exactMatches > 0) return exactMatches / deltaTexts.length

  const candidateBlob = candidateTexts.join(" ")
  const deltaTokens = tokenSet(deltaTexts.join(" "))
  if (deltaTokens.size === 0) return 0

  const candidateTokens = tokenSet(candidateBlob)
  return jaccard(candidateTokens, deltaTokens)
}

function componentMultiset(node: SpecNode): Map<string, number> {
  const counts = new Map<string, number>()
  walk(node, current => {
    counts.set(current.component, (counts.get(current.component) ?? 0) + 1)
  })
  return counts
}

function keyValueSimilarity(
  candidate: Map<string, string>,
  delta: Map<string, string>,
): number {
  if (delta.size === 0) return 1
  if (candidate.size === 0) return 0

  let matches = 0
  for (const [key, value] of delta) {
    if (candidate.get(key) === value) matches += 1
  }
  return matches / delta.size
}

function flattenComparableValues(
  values: Record<string, string | number | boolean> | undefined,
): Map<string, string> {
  const result = new Map<string, string>()
  if (!values) return result

  for (const [key, value] of Object.entries(values)) {
    result.set(key, String(value))
  }
  return result
}

function multisetSimilarity(candidate: Map<string, number>, delta: Map<string, number>): number {
  if (delta.size === 0) return 1
  if (candidate.size === 0) return 0

  let overlap = 0
  let total = 0
  for (const [key, deltaCount] of delta) {
    overlap += Math.min(candidate.get(key) ?? 0, deltaCount)
    total += deltaCount
  }
  return overlap / total
}

function dimensionSimilarity(candidate: SpecNode, delta: SpecNode): number {
  if (!candidate.dimensions || !delta.dimensions) return 1
  return (
    axisDimensionScore(candidate.dimensions.width, delta.dimensions.width)
    + axisDimensionScore(candidate.dimensions.height, delta.dimensions.height)
  ) / 2
}

function axisDimensionScore(candidate: number, delta: number): number {
  if (delta === 0) return candidate === 0 ? 1 : 0
  const ratio = Math.abs(candidate - delta) / delta
  if (ratio <= SIZE_TOLERANCE_RATIO) return 1
  return Math.max(0, 1 - ratio)
}

function confidenceForScore(score: number): "high" | "medium" | "low" {
  if (score >= HIGH_SIMILARITY_THRESHOLD) return "high"
  if (score >= MEDIUM_SIMILARITY_THRESHOLD) return "medium"
  return "low"
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase()
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9$%.]+/i)
      .filter(token => token.length > 1),
  )
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (right.size === 0) return 1

  let intersection = 0
  for (const token of right) {
    if (left.has(token)) intersection += 1
  }

  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}

function walk(node: SpecNode, visit: (node: SpecNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

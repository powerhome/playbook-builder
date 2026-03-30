/**
 * Text extraction and typography classification.
 *
 * Handles TEXT nodes → Playbook typography components (Title, Body, Caption, Detail)
 * and provides utility functions for extracting text content, colors, and alignment
 * from Figma node trees.
 */
import type { FigmaNode, SpecNode, VariableMap } from "./types"
import { mapColor, resolveColorFromVariable } from "./spacing-mapper"

// ---------------------------------------------------------------------------
// Typography classification thresholds
// ---------------------------------------------------------------------------

const TITLE_SIZE_3_MIN_FONT = 20
const TITLE_SIZE_4_MIN_FONT = 14
const CAPTION_MAX_FONT = 12
const BOLD_MIN_WEIGHT = 700
const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_WEIGHT = 400

// ---------------------------------------------------------------------------
// TEXT → Typography component
// ---------------------------------------------------------------------------

/**
 * Classify a TEXT node into a Playbook typography component.
 * Uses explicit font-size and weight thresholds:
 *   - size >= 20 + bold → Title size 3
 *   - size >= 14 + bold → Title size 4
 *   - size <= 12         → Caption xs
 *   - bold (any size)    → Detail bold
 *   - default            → Body
 */
export function processText(node: FigmaNode, variables: VariableMap): SpecNode {
  const text = node.characters ?? ""
  const size = node.style?.fontSize ?? DEFAULT_FONT_SIZE
  const weight = node.style?.fontWeight ?? DEFAULT_FONT_WEIGHT
  const isBold = weight >= BOLD_MIN_WEIGHT

  const color = resolveColorFromVariable(node.boundVariables?.fills, variables)
    ?? mapColor(node.fills)
    ?? "default"

  const withColor = (extra: Record<string, string | number | boolean>) =>
    ({ color, ...extra })

  if (isBold && size >= TITLE_SIZE_3_MIN_FONT) {
    return { component: "Title", props: withColor({ size: 3, bold: true }), text }
  }
  if (isBold && size >= TITLE_SIZE_4_MIN_FONT) {
    return { component: "Title", props: withColor({ size: 4, bold: true }), text }
  }
  if (size <= CAPTION_MAX_FONT) {
    return { component: "Caption", props: withColor({ size: "xs" }), text }
  }
  if (isBold) {
    return { component: "Detail", props: withColor({ bold: true }), text }
  }
  return { component: "Body", props: { color }, text }
}

// ---------------------------------------------------------------------------
// Text extraction utilities
// ---------------------------------------------------------------------------

/** Font families used for icons — TEXT nodes with these are not display text. */
const ICON_FONT_FAMILIES: ReadonlySet<string> = new Set([
  "font awesome 6 pro",
  "font awesome 6 free",
  "font awesome 5 pro",
  "font awesome 5 free",
  "fontawesome",
])

function isIconTextNode(node: FigmaNode): boolean {
  const family = node.style?.fontFamily?.toLowerCase() ?? ""
  return ICON_FONT_FAMILIES.has(family)
}

/** Extract the first non-icon text string from a node tree (depth-first). */
export function extractText(children: FigmaNode[] | undefined): string | undefined {
  if (!children) return undefined
  for (const child of children) {
    if (child.type === "TEXT" && child.characters && !isIconTextNode(child)) {
      return child.characters
    }
    const nested = extractText(child.children)
    if (nested) return nested
  }
  return undefined
}

/** Collect ALL text values from a node tree in document order. */
export function extractAllTexts(children: FigmaNode[] | undefined): string[] {
  if (!children) return []
  const texts: string[] = []
  for (const child of children) {
    if (child.type === "TEXT" && child.characters) {
      texts.push(child.characters)
    }
    texts.push(...extractAllTexts(child.children))
  }
  return texts
}

/**
 * Extract the fill color from child TEXT nodes.
 * Uses variable bindings first, then fuzzy RGB matching.
 * Returns "default" when no fills are present.
 */
export function extractTextColor(
  children: FigmaNode[] | undefined,
  variables: VariableMap,
): string {
  if (!children) return "default"
  for (const child of children) {
    if (child.type === "TEXT") {
      return resolveColorFromVariable(child.boundVariables?.fills, variables)
        ?? mapColor(child.fills)
        ?? "default"
    }
    const nested = extractTextColor(child.children, variables)
    if (nested !== "default") return nested
  }
  return "default"
}

/** Extract label and placeholder from TEXT-type component properties. */
export function extractTextProperties(
  node: FigmaNode,
): { label?: string; placeholder?: string } {
  const result: { label?: string; placeholder?: string } = {}
  if (!node.componentProperties) return result

  for (const [rawKey, prop] of Object.entries(node.componentProperties)) {
    if (prop.type !== "TEXT" || typeof prop.value !== "string") continue
    const key = rawKey.replace(/#.*$/, "").trim().toLowerCase()

    if (key === "placeholder" || key === "placeholder text") {
      result.placeholder = prop.value
    } else if (key === "label" || key === "label text") {
      result.label = prop.value
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Text alignment extraction
// ---------------------------------------------------------------------------

/** Figma textAlignHorizontal → Playbook textAlign prop value. */
const TEXT_ALIGN_MAP: Record<string, string> = {
  CENTER: "center",
  RIGHT: "right",
  JUSTIFIED: "justify",
}

/**
 * Walk child TEXT nodes and return the dominant non-default text alignment.
 * Only returns a value when all visible text nodes agree on a non-LEFT alignment.
 */
export function extractTextAlign(
  children: FigmaNode[] | undefined,
): string | undefined {
  if (!children) return undefined
  const aligns = new Set<string>()
  collectTextAligns(children, aligns)
  if (aligns.size === 1) {
    const [align] = aligns
    return TEXT_ALIGN_MAP[align]
  }
  return undefined
}

function collectTextAligns(nodes: FigmaNode[], out: Set<string>): void {
  for (const node of nodes) {
    if (node.type === "TEXT" && node.style?.textAlignHorizontal) {
      const align = node.style.textAlignHorizontal
      if (align !== "LEFT") out.add(align)
    }
    if (node.children) collectTextAligns(node.children, out)
  }
}

/**
 * Detect layout-based horizontal text centering on an instance.
 *   - VERTICAL layout + counterAxisAlignItems CENTER → "center"
 *   - HORIZONTAL layout + primaryAxisAlignItems CENTER → "center"
 */
export function detectLayoutTextCenter(
  node: FigmaNode,
): string | undefined {
  if (node.layoutMode === "VERTICAL" && node.counterAxisAlignItems === "CENTER") {
    return "center"
  }
  if (node.layoutMode === "HORIZONTAL" && node.primaryAxisAlignItems === "CENTER") {
    return "center"
  }
  return undefined
}

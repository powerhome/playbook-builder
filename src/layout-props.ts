/**
 * Layout property helpers.
 *
 * Maps Figma auto-layout properties (spacing, padding, alignment)
 * to Playbook prop values. Used by both frame-processor and instance-processor.
 */
import type { FigmaNode, PlaybookProps } from "./types"
import { mapSpacing, mapAlignment } from "./spacing-mapper"

// ---------------------------------------------------------------------------
// Padding resolution
// ---------------------------------------------------------------------------

/**
 * Emit the most specific padding props for all four sides.
 * Uses shorthand (padding, paddingX, paddingY) when sides match,
 * falls back to individual props when they differ.
 */
export function addResolvedPadding(
  node: FigmaNode,
  props: PlaybookProps,
): void {
  const l = node.paddingLeft ?? 0
  const r = node.paddingRight ?? 0
  const t = node.paddingTop ?? 0
  const b = node.paddingBottom ?? 0

  if (l === r && t === b && l === t) {
    const p = mapSpacing(l)
    if (p) props.padding = p
    return
  }

  if (l === r) {
    const px = mapSpacing(l)
    if (px) props.paddingX = px
  } else {
    const pl = mapSpacing(l)
    if (pl) props.paddingLeft = pl
    const pr = mapSpacing(r)
    if (pr) props.paddingRight = pr
  }

  if (t === b) {
    const py = mapSpacing(t)
    if (py) props.paddingY = py
  } else {
    const pt = mapSpacing(t)
    if (pt) props.paddingTop = pt
    const pb = mapSpacing(b)
    if (pb) props.paddingBottom = pb
  }
}

/** Add only padding props (no gap). Used for Cards with explicit Flex children. */
export function addPaddingProps(
  node: FigmaNode,
  props: PlaybookProps,
): void {
  addResolvedPadding(node, props)
}

/** Add gap + padding props from a node's auto-layout settings. */
export function addSpacingProps(
  node: FigmaNode,
  props: PlaybookProps,
): void {
  const gap = mapSpacing(node.itemSpacing)
  if (gap) props.gap = gap
  addResolvedPadding(node, props)
}

// ---------------------------------------------------------------------------
// Alignment resolution
// ---------------------------------------------------------------------------

/** Map Figma primary/counter axis alignment to Playbook justify/align props. */
export function addAlignmentProps(
  node: FigmaNode,
  props: PlaybookProps,
): void {
  const justify = mapAlignment(node.primaryAxisAlignItems)
  if (justify && justify !== "start") props.justify = justify

  const align = mapAlignment(node.counterAxisAlignItems)
  if (align && align !== "start") props.align = align
}

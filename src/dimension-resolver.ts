/**
 * Dimension resolution and CSS fallback generation.
 *
 * Handles:
 * - Raw pixel dimensions preservation (addDimensions)
 * - Cross-axis FILL → width/height: "100%" with htmlOptions fallback
 * - Primary-axis FILL → flex: "1"
 * - Auto-centering maxWidth containers
 * - Routing rgba() backgrounds to htmlOptions
 */
import type { FigmaNode, SpecNode, SpecNodeDimensions, PlaybookProps } from "./types"

// ---------------------------------------------------------------------------
// Component classification for sizing behavior
// ---------------------------------------------------------------------------

/** Leaf text components where cross-axis fill adds visual noise. */
export const LEAF_TEXT_NAMES: ReadonlySet<string> = new Set([
  "Title", "Body", "Caption", "Detail",
  "Badge", "Pill", "Icon",
])

/**
 * Components where Playbook global dimension props (width, height)
 * reliably propagate to the rendered DOM element.
 * All other components need htmlOptions as a CSS specificity fallback.
 */
const RELIABLE_DIMENSION_COMPONENTS: ReadonlySet<string> = new Set([
  "Flex", "FlexItem",
])

// ---------------------------------------------------------------------------
// Dimension preservation
// ---------------------------------------------------------------------------

/**
 * Attach raw pixel dimensions from Figma to the spec node.
 * Emitted on all layout containers (Flex, Card, etc.) so agents
 * can compute flex ratios (FIXED siblings) and detect missing
 * maxWidth constraints (FILL containers with large effective widths).
 */
export function addDimensions(node: FigmaNode, spec: SpecNode): void {
  if (!node.absoluteBoundingBox) return
  if (LEAF_TEXT_NAMES.has(spec.component)) return
  if (spec.component.startsWith("_")) return

  const sizingH = node.layoutSizingHorizontal
  const sizingV = node.layoutSizingVertical

  const dims: SpecNodeDimensions = {
    width: Math.round(node.absoluteBoundingBox.width),
    height: Math.round(node.absoluteBoundingBox.height),
  }
  if (sizingH) dims.sizingH = sizingH
  if (sizingV) dims.sizingV = sizingV
  spec.dimensions = dims
}

// ---------------------------------------------------------------------------
// Parent-relative sizing (called from processChildren)
// ---------------------------------------------------------------------------

/**
 * Apply sizing props to a child node based on its parent's layout context.
 *
 * Explicitly handles three cases:
 * 1. Primary-axis FILL → flex: "1" (grow to fill remaining space)
 * 2. Cross-axis FILL → width/height: "100%" + htmlOptions fallback
 * 3. maxWidth in a centered parent → margin: "auto"
 */
export function applySizingFromParent(
  spec: SpecNode,
  node: FigmaNode,
  parentLayoutMode: string,
  parentCrossAlign?: string,
): void {
  if (!spec.props) spec.props = {}

  applyPrimaryAxisFill(spec.props, node, parentLayoutMode)
  applyCrossAxisFill(spec, node, parentLayoutMode, parentCrossAlign)
  applyAutoCenter(spec.props, parentLayoutMode, parentCrossAlign)

  if (Object.keys(spec.props).length === 0) spec.props = undefined
}

function applyPrimaryAxisFill(
  props: PlaybookProps,
  node: FigmaNode,
  parentLayoutMode: string,
): void {
  const primarySizing = parentLayoutMode === "HORIZONTAL"
    ? node.layoutSizingHorizontal
    : node.layoutSizingVertical
  if (primarySizing === "FILL") {
    props.flex = "1"
  }
}

function applyCrossAxisFill(
  spec: SpecNode,
  node: FigmaNode,
  parentLayoutMode: string,
  parentCrossAlign?: string,
): void {
  const crossSizing = parentLayoutMode === "HORIZONTAL"
    ? node.layoutSizingVertical
    : node.layoutSizingHorizontal

  if (crossSizing !== "FILL") return
  if (LEAF_TEXT_NAMES.has(spec.component)) return

  const dimProp = parentLayoutMode === "VERTICAL" ? "width" : "height"

  // For height in a HORIZONTAL parent: skip when the parent will have
  // align="stretch". The frame-processor auto-adds align="stretch" when
  // any child has FILL cross-axis sizing and no explicit alignment
  // overrides it. Flexbox stretch handles the height natively —
  // emitting height: "100%" is redundant and unreliable (percentage
  // heights require an explicit parent height to resolve).
  if (dimProp === "height" && parentWillStretch(parentCrossAlign)) {
    return
  }

  if (!spec.props) spec.props = {}
  spec.props[dimProp] = "100%"

  if (!RELIABLE_DIMENSION_COMPONENTS.has(spec.component)) {
    addHtmlOptionStyle(spec, dimProp, "100%")
  }
}

/**
 * Determine if the parent's cross-axis alignment will resolve to "stretch".
 *
 * Returns true when:
 * - No explicit alignment (undefined / "MIN") → frame-processor auto-adds stretch
 * - Explicit "STRETCH" from Figma
 *
 * Returns false when CENTER / MAX / BASELINE override stretch behavior.
 */
function parentWillStretch(parentCrossAlign?: string): boolean {
  if (!parentCrossAlign || parentCrossAlign === "MIN") return true
  if (parentCrossAlign === "STRETCH") return true
  return false
}

function applyAutoCenter(
  props: PlaybookProps,
  parentLayoutMode: string,
  parentCrossAlign?: string,
): void {
  if (parentLayoutMode === "VERTICAL"
    && parentCrossAlign === "CENTER"
    && props.maxWidth) {
    props.margin = "auto"
  }
}

// ---------------------------------------------------------------------------
// htmlOptions management
// ---------------------------------------------------------------------------

/**
 * Append an inline style to the spec's htmlOptions escape hatch.
 * Safely initializes the nested structure without overwriting existing entries.
 */
export function addHtmlOptionStyle(
  spec: SpecNode,
  prop: string,
  value: string,
): void {
  if (!spec.htmlOptions) spec.htmlOptions = { style: {} }
  spec.htmlOptions.style[prop] = value
}

/**
 * Route rgba() background values from props to htmlOptions.
 * Playbook's background prop only accepts named tokens.
 * Semi-transparent rgba() values must be applied via inline CSS.
 */
export function routeRgbaBackground(spec: SpecNode): void {
  if (!spec.props?.background) return
  const bg = String(spec.props.background)
  if (!bg.startsWith("rgba(")) return

  delete spec.props.background
  addHtmlOptionStyle(spec, "background", bg)
}

// ---------------------------------------------------------------------------
// Cross-axis stretch detection
// ---------------------------------------------------------------------------

/**
 * Check if any child of a HORIZONTAL layout has cross-axis FILL sizing.
 * When true, the parent needs align="stretch" for height: "100%" to work.
 */
export function needsCrossAxisStretch(
  children: FigmaNode[] | undefined,
): boolean {
  if (!children) return false
  return children.some((child) => child.layoutSizingVertical === "FILL")
}

/**
 * Figma FRAME / GROUP node processing.
 *
 * Converts auto-layout frames into Playbook Flex or Card components.
 * Detects card-like frames (fill + stroke/radius) and wraps them
 * in Card components with proper layout preservation.
 */
import type {
  FigmaNode, SpecNode, PlaybookProps, ChildrenProcessorFn,
  VariableMap,
} from "./types"
import { INTERNAL_COMPONENTS } from "./types"
import {
  mapSpacing, mapBorderRadius, mapNonUniformBorderRadius, mapMaxWidth,
  mapBackgroundColor, isWhiteFill, resolveBgFromVariable,
} from "./spacing-mapper"
import { addSpacingProps, addPaddingProps, addAlignmentProps } from "./layout-props"
import { addHtmlOptionStyle, routeRgbaBackground, needsCrossAxisStretch } from "./dimension-resolver"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a FRAME, GROUP, SECTION, COMPONENT, or COMPONENT_SET node.
 * Routes to Flex or Card based on visual properties and auto-layout.
 */
export function processFrame(
  node: FigmaNode,
  variables: VariableMap,
  processChildren: ChildrenProcessorFn,
): SpecNode {
  const children = processChildren(
    node.children,
    node.layoutMode,
    node.counterAxisAlignItems,
  )

  if (node.layoutMode === "VERTICAL" || node.layoutMode === "HORIZONTAL") {
    return processAutoLayoutFrame(node, children, variables)
  }

  if (isCardLike(node)) {
    return { component: "Card", figmaName: node.name, children }
  }

  if (children.length === 1) return children[0]
  if (children.length === 0) {
    return { component: INTERNAL_COMPONENTS.FRAME, figmaName: node.name }
  }

  return { component: INTERNAL_COMPONENTS.FRAME, figmaName: node.name, children }
}

// ---------------------------------------------------------------------------
// Auto-layout frame → Flex or Card
// ---------------------------------------------------------------------------

function processAutoLayoutFrame(
  node: FigmaNode,
  children: SpecNode[],
  variables: VariableMap,
): SpecNode {
  const props: PlaybookProps = {
    orientation: node.layoutMode === "VERTICAL" ? "column" : "row",
  }
  addSpacingProps(node, props)
  addAlignmentProps(node, props)

  if (isCardLike(node)) {
    return buildCardSpec(node, children, variables)
  }

  if (node.layoutMode === "HORIZONTAL" && !props.align && needsCrossAxisStretch(node.children)) {
    props.align = "stretch"
  }

  applyFlexBackground(node, props, variables)
  applyMaxWidth(node, props)

  const flexSpec: SpecNode = { component: "Flex", props, children }
  routeRgbaBackground(flexSpec)
  return flexSpec
}

// ---------------------------------------------------------------------------
// Card detection and building
// ---------------------------------------------------------------------------

/**
 * A frame is card-like when it has:
 * - A solid fill (background color), AND
 * - Either a stroke (border) OR a corner radius
 */
function isCardLike(node: FigmaNode): boolean {
  const hasFill = node.fills?.some(
    (f) => f.type === "SOLID" && f.visible !== false,
  ) ?? false
  const hasStroke = (node.strokes?.length ?? 0) > 0
  const hasRadius = (node.cornerRadius ?? 0) > 0
  return hasFill && (hasStroke || hasRadius)
}

function buildCardSpec(
  node: FigmaNode,
  children: SpecNode[],
  variables: VariableMap,
): SpecNode {
  const cardProps: PlaybookProps = {}
  addPaddingProps(node, cardProps)

  const hasPadding = "padding" in cardProps
    || "paddingX" in cardProps
    || "paddingY" in cardProps
  if (!hasPadding) cardProps.padding = "none"

  const nonUniformRadius = mapNonUniformBorderRadius(node.rectangleCornerRadii)
  if (nonUniformRadius) {
    // Non-uniform corners (e.g. segmented controls) → CSS escape hatch
    cardProps.borderRadius = "none"
  } else {
    const radius = mapBorderRadius(node.cornerRadius ?? 0)
    if (radius && radius !== "md") cardProps.borderRadius = radius
  }

  const bg = resolveBgFromVariable(node.boundVariables?.fills, variables)
    ?? mapBackgroundColor(node.fills)
  if (bg) cardProps.background = bg

  applyMaxWidth(node, cardProps)

  const cardSpec = node.layoutMode === "HORIZONTAL"
    ? buildHorizontalCard(node, cardProps, children)
    : buildVerticalCard(node, cardProps, children)

  if (nonUniformRadius) {
    addHtmlOptionStyle(cardSpec, "borderRadius", nonUniformRadius)
  }

  return cardSpec
}

function buildHorizontalCard(
  node: FigmaNode,
  cardProps: PlaybookProps,
  children: SpecNode[],
): SpecNode {
  const flexProps: PlaybookProps = { orientation: "row" }
  const gap = mapSpacing(node.itemSpacing)
  if (gap) flexProps.gap = gap
  addAlignmentProps(node, flexProps)

  if (!flexProps.align && needsCrossAxisStretch(node.children)) {
    flexProps.align = "stretch"
  }

  const wrapper: SpecNode = { component: "Flex", props: flexProps, children }
  const cardSpec: SpecNode = { component: "Card", props: cardProps, children: [wrapper] }
  routeRgbaBackground(cardSpec)
  return cardSpec
}

function buildVerticalCard(
  node: FigmaNode,
  cardProps: PlaybookProps,
  children: SpecNode[],
): SpecNode {
  const gap = mapSpacing(node.itemSpacing)
  if (gap) cardProps.gap = gap
  addAlignmentProps(node, cardProps)

  const cardSpec: SpecNode = { component: "Card", props: cardProps, children }
  routeRgbaBackground(cardSpec)
  return cardSpec
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function applyFlexBackground(
  node: FigmaNode,
  props: PlaybookProps,
  variables: VariableMap,
): void {
  const bg = resolveBgFromVariable(node.boundVariables?.fills, variables)
    ?? mapBackgroundColor(node.fills)
  if (bg) {
    props.background = bg
  } else if (isWhiteFill(node.fills)) {
    props.background = "white"
  }
}

/**
 * Map a node's effective width to a Playbook maxWidth token.
 * Works for both FIXED and FILL nodes — a FILL column inside a
 * constrained parent has a known effective width from absoluteBoundingBox
 * that should produce maxWidth when it matches a Playbook token.
 */
export function applyMaxWidth(node: FigmaNode, props: PlaybookProps): void {
  if (!node.absoluteBoundingBox) return
  const mw = mapMaxWidth(node.absoluteBoundingBox.width)
  if (mw) {
    props.maxWidth = mw
    props.width = "100%"
  }
}

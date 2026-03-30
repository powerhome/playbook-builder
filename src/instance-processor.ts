/**
 * Figma INSTANCE node processing.
 *
 * Resolves Figma component instances to Playbook component specs.
 * Dispatches to specialized builders for containers, form inputs,
 * and child-accepting components like SelectableCard.
 */
import type {
  FigmaNode,
  SpecNode,
  VariableMap,
  ComponentMap,
  ChildrenProcessorFn,
  NodeProcessorFn,
} from "./types"
import {
  resolveBgFromVariable,
  mapBackgroundColor,
  mapNonUniformBorderRadius,
} from "./spacing-mapper"
import {
  extractText,
  extractTextColor,
  extractAllTexts,
  extractTextProperties,
  extractTextAlign,
  detectLayoutTextCenter,
} from "./text-processor"
import { addSpacingProps, addAlignmentProps } from "./layout-props"
import {
  addDimensions,
  addHtmlOptionStyle,
  routeRgbaBackground,
} from "./dimension-resolver"
import { applyMaxWidth } from "./frame-processor"
import {
  extractInstanceProps,
  resolvePlaybookName,
  buildBreadcrumbSpec,
} from "./instance-helpers"
import { processTable } from "./table-processor"
import { inferNavVariant } from "./nav-processor"

// ---------------------------------------------------------------------------
// Component classification
// ---------------------------------------------------------------------------

/** Components that act as layout containers with processable children. */
const CONTAINER_NAMES: ReadonlySet<string> = new Set([
  "Card",
  "Flex",
  "FlexItem",
  "FormGroup",
  "BreadCrumbs",
  "Nav",
])

/** Form input components that need label/placeholder extraction. */
const FORM_INPUT_NAMES: ReadonlySet<string> = new Set([
  "TextInput",
  "Textarea",
  "Select",
])

/** Components with specialized sub-component processors. */
const TABLE_NAMES: ReadonlySet<string> = new Set(["Table"])

/** Components that render Playbook children (not flat text). */
const CHILD_ACCEPTING_NAMES: ReadonlySet<string> = new Set([
  "SelectableCard",
  "SelectableCardIcon",
])

/** Playbook text components that require an explicit color prop. */
const TEXT_COLOR_NAMES: ReadonlySet<string> = new Set([
  "Title",
  "Body",
  "Caption",
  "Detail",
])

const TEXTAREA_LINE_HEIGHT_PX = 22

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process an INSTANCE node.
 * Resolves the Figma component name to a Playbook name, then delegates
 * to buildPlaybookNode. Falls back to frame processing for unknown instances.
 */
export function processInstance(
  node: FigmaNode,
  components: ComponentMap,
  variables: VariableMap,
  fallbackToFrame: NodeProcessorFn,
  processChildren: ChildrenProcessorFn
): SpecNode {
  const resolved = resolvePlaybookName(node.name)
  if (resolved) {
    return buildPlaybookNode(
      resolved,
      node,
      components,
      variables,
      processChildren
    )
  }

  if (node.componentId && components[node.componentId]) {
    const compName = components[node.componentId].name
    const compResolved = resolvePlaybookName(compName)
    if (compResolved) {
      return buildPlaybookNode(
        compResolved,
        node,
        components,
        variables,
        processChildren
      )
    }
  }

  return fallbackToFrame(node)
}

// ---------------------------------------------------------------------------
// Playbook node builder — dispatches to specialized handlers
// ---------------------------------------------------------------------------

function buildPlaybookNode(
  name: string,
  node: FigmaNode,
  components: ComponentMap,
  variables: VariableMap,
  processChildren: ChildrenProcessorFn
): SpecNode {
  if (TABLE_NAMES.has(name)) {
    return processTable(node, variables)
  }

  const result: SpecNode = { component: name }
  const instanceProps = extractInstanceProps(node, name)
  if (Object.keys(instanceProps).length) result.props = instanceProps

  if (CONTAINER_NAMES.has(name)) {
    const containerResult = buildContainerNode(
      result,
      name,
      node,
      variables,
      processChildren
    )
    if (containerResult) return containerResult
  } else if (FORM_INPUT_NAMES.has(name)) {
    buildFormInputNode(result, name, node)
  } else if (CHILD_ACCEPTING_NAMES.has(name)) {
    buildChildAcceptingNode(result, node, components, variables)
  } else {
    const text = extractText(node.children)
    if (text) result.text = text
  }

  if (TEXT_COLOR_NAMES.has(name)) {
    if (!result.props) result.props = {}
    result.props.color = extractTextColor(node.children, variables)
  }

  if (name === "Pill" || name === "Badge") {
    if (!result.props) result.props = {}
    result.props.textTransform = "none"
  }

  if (!CHILD_ACCEPTING_NAMES.has(name)) {
    const textAlign = extractTextAlign(node.children)
    if (textAlign) {
      if (!result.props) result.props = {}
      result.props.textAlign = textAlign
    }
  }

  const nonUniformRadius = mapNonUniformBorderRadius(node.rectangleCornerRadii)
  if (nonUniformRadius) {
    addHtmlOptionStyle(result, "borderRadius", nonUniformRadius)
  }

  routeRgbaBackground(result)
  addDimensions(node, result)
  return result
}

// ---------------------------------------------------------------------------
// Specialized node builders
// ---------------------------------------------------------------------------

/**
 * Process a container component (Card, Flex, FormGroup, BreadCrumbs, Nav).
 * Returns a complete SpecNode for BreadCrumbs (bypasses post-processing),
 * or null to continue with generic post-processing.
 */
function buildContainerNode(
  result: SpecNode,
  name: string,
  node: FigmaNode,
  variables: VariableMap,
  processChildren: ChildrenProcessorFn
): SpecNode | null {
  const children = processChildren(
    node.children,
    node.layoutMode,
    node.counterAxisAlignItems
  )

  if (name === "BreadCrumbs" && children.length) {
    return buildBreadcrumbSpec(node, children)
  }

  if (node.layoutMode) {
    if (!result.props) result.props = {}
    addSpacingProps(node, result.props)
    addAlignmentProps(node, result.props)
  }

  const instBg =
    resolveBgFromVariable(node.boundVariables?.fills, variables) ??
    mapBackgroundColor(node.fills)
  if (instBg) {
    if (!result.props) result.props = {}
    result.props.background = instBg
  }

  if (name === "Nav" && !result.props?.variant) {
    const inferred = inferNavVariant(node)
    if (inferred) {
      if (!result.props) result.props = {}
      result.props.variant = inferred
    }
  }

  if (name === "Card" || name === "Flex") {
    if (!result.props) result.props = {}
    applyMaxWidth(node, result.props)
  }

  if (children.length) result.children = children
  return null
}

function buildFormInputNode(
  result: SpecNode,
  name: string,
  node: FigmaNode
): void {
  const textProps = extractTextProperties(node)
  const allTexts = extractAllTexts(node.children)

  const label = textProps.label ?? allTexts[0]
  if (label) result.text = label

  if (allTexts.includes("*")) {
    if (!result.props) result.props = {}
    result.props.requiredIndicator = true
  }

  const placeholder =
    textProps.placeholder ??
    allTexts.find(t => t !== label && t !== "*" && t.length > 1)
  if (placeholder) {
    if (!result.props) result.props = {}
    result.props.placeholder = placeholder
  }

  if (!result.props) result.props = {}
  result.props.marginBottom = "none"

  if (name === "Textarea" && node.absoluteBoundingBox) {
    const rows = Math.round(
      node.absoluteBoundingBox.height / TEXTAREA_LINE_HEIGHT_PX
    )
    if (rows > 1) result.props.rows = rows
  }
}

function buildChildAcceptingNode(
  result: SpecNode,
  node: FigmaNode,
  components: ComponentMap,
  variables: VariableMap
): void {
  const children = extractPlaybookChildren(node, components, variables)
  if (children.length) {
    const layoutCenter = detectLayoutTextCenter(node)
    if (layoutCenter) {
      for (const child of children) {
        if (TEXT_COLOR_NAMES.has(child.component)) {
          if (!child.props) child.props = {}
          child.props.textAlign = layoutCenter
        }
      }
    }
    result.children = children
  } else {
    const text = extractText(node.children)
    if (text) result.text = text
  }
}

// ---------------------------------------------------------------------------
// Playbook children extraction (for SelectableCard, etc.)
// ---------------------------------------------------------------------------

function extractPlaybookChildren(
  node: FigmaNode,
  components: ComponentMap,
  variables: VariableMap
): SpecNode[] {
  if (!node.children) return []
  const results: SpecNode[] = []
  for (const child of node.children) {
    if (child.visible === false) continue
    if (child.type === "INSTANCE") {
      const resolved =
        resolvePlaybookName(child.name) ??
        (child.componentId && components[child.componentId]
          ? resolvePlaybookName(components[child.componentId].name)
          : undefined)
      if (resolved && TEXT_COLOR_NAMES.has(resolved)) {
        results.push(
          buildPlaybookNode(resolved, child, components, variables, () => [])
        )
        continue
      }
    }
    if (child.children) {
      results.push(...extractPlaybookChildren(child, components, variables))
    }
  }
  return results
}

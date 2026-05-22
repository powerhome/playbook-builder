/**
 * Nested icon carrier detection and merge into parent Playbook props.
 */
import type { ComponentMap, FigmaNode, PlaybookProps } from "./types"
import {
  extractInstanceProps,
  isRawFigmaNodeId,
  normalizePropertyKey,
  type ExtractInstancePropsOptions,
} from "./instance-helpers"

export type IconCarrierKind = "full" | "selection"

const ICON_CARRIER_LAYER_KEYS = new Set(["icon", "iconselection", "iconinner"])

function layerKey(name: string): string {
  return name.replace(/^\./, "").trim().toLowerCase()
}

export function hasIconComponentProperty(node: FigmaNode): boolean {
  if (!node.componentProperties) return false
  return Object.keys(node.componentProperties).some(
    (k) => normalizePropertyKey(k) === "icon",
  )
}

/** Classify a direct child as an icon glyph carrier. */
export function classifyIconCarrier(
  child: FigmaNode,
  components: ComponentMap,
): IconCarrierKind | null {
  if (child.type !== "INSTANCE" || child.visible === false) return null

  const fromLayer = layerKey(child.name)
  if (fromLayer === "iconselection") return "selection"
  if (ICON_CARRIER_LAYER_KEYS.has(fromLayer)) return "full"

  const compName = child.componentId
    ? components[child.componentId]?.name
    : undefined
  if (compName) {
    const fromComp = layerKey(compName)
    if (fromComp === "iconselection") return "selection"
    if (ICON_CARRIER_LAYER_KEYS.has(fromComp)) return "full"
  }

  if (!hasIconComponentProperty(child)) return null

  const keys = Object.keys(child.componentProperties ?? {}).map(normalizePropertyKey)
  if (keys.includes("color") || keys.includes("dark")) return "full"
  return "selection"
}

export interface MergeNestedIconResult {
  props: PlaybookProps
  skipChildIds: ReadonlySet<string>
}

/** Merge props from direct nested icon carriers into the parent Playbook instance. */
export function mergeNestedIconCarrierProps(
  parentName: string,
  node: FigmaNode,
  components: ComponentMap,
  nodeIndex: Map<string, FigmaNode>,
): MergeNestedIconResult {
  const merged: PlaybookProps = {}
  const skipChildIds = new Set<string>()
  const parentIsIcon = parentName === "Icon"

  for (const child of node.children ?? []) {
    const carrier = classifyIconCarrier(child, components)
    if (!carrier) continue

    skipChildIds.add(child.id)
    const extractOpts: ExtractInstancePropsOptions = {
      components,
      nodeIndex,
      includeDefaults: parentIsIcon || carrier === "full",
      allowedProps: carrier === "selection"
        ? new Set(["icon"])
        : parentIsIcon
          ? new Set(["icon", "color", "dark"])
          : new Set(["icon"]),
    }

    const childProps = extractInstanceProps(child, parentName, extractOpts)
    if (childProps.icon !== undefined && !isRawFigmaNodeId(childProps.icon)) {
      merged.icon = childProps.icon
    }
    if (parentIsIcon && carrier === "full") {
      if (childProps.color !== undefined) merged.color = childProps.color
      if (childProps.dark !== undefined) merged.dark = childProps.dark
    }
  }

  return { props: merged, skipChildIds }
}

/** Filter figma children that were merged into a parent instance. */
export function filterMergedIconChildren(
  children: FigmaNode[] | undefined,
  skipChildIds: ReadonlySet<string>,
): FigmaNode[] | undefined {
  if (!children?.length || !skipChildIds.size) return children
  return children.filter((c) => !skipChildIds.has(c.id))
}

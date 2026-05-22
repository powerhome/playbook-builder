/**
 * Instance processing helpers.
 *
 * Extracts Figma component properties into Playbook props,
 * resolves Figma names to Playbook component names,
 * and assembles BreadCrumbs from raw crumb nodes.
 */
import type {
  ComponentMap,
  FigmaNode,
  PlaybookProps,
  SpecNode,
} from "./types"
import { PLAYBOOK_NAMES } from "./playbook-names"
import { addResolvedPadding } from "./layout-props"

// ---------------------------------------------------------------------------
// Prop extraction constants
// ---------------------------------------------------------------------------

/** Map of Figma component property names → Playbook prop names. */
const PROP_NAME_MAP: Readonly<Record<string, string>> = {
  variant: "variant",
  size: "size",
  disabled: "disabled",
  required: "requiredIndicator",
  loading: "loading",
  color: "color",
  status: "status",
  icon: "icon",
  dark: "dark",
  type: "type",
  orientation: "orientation",
  fullwidth: "fullWidth",
  checked: "checked",
  selected: "selected",
  bold: "bold",
}

/** Components where "selected" should map to "checked" in Playbook. */
const SELECTED_AS_CHECKED: ReadonlySet<string> = new Set(["SelectableCard"])

/** Figma size labels → Playbook size tokens. */
const SIZE_VALUE_MAP: Readonly<Record<string, string>> = {
  "extra small": "xs", xs: "xs",
  small: "sm", sm: "sm",
  medium: "md", md: "md",
  large: "lg", lg: "lg",
  "extra large": "xl", xl: "xl",
  "1x": "1x",
  "2x": "2x",
  "3x": "3x",
  "4x": "4x",
  "5x": "5x",
  "6x": "6x",
  "7x": "7x",
  "8x": "8x",
  "9x": "9x",
  "10x": "10x"
}

/** Values that mean "use default" — not worth emitting in the spec. */
const SKIP_VALUES: ReadonlySet<string> = new Set([
  "default", "none", "off", "auto", "false",
])

const SEE_APPEARANCES = "see appearances"
const NODE_ID_PATTERN = /^\d+:\d+$/

/** Props to keep when includeDefaults is true (Icon API). */
const DEFAULT_EMIT_PROPS: ReadonlySet<string> = new Set(["color", "dark"])

// ---------------------------------------------------------------------------
// Property key normalization & INSTANCE_SWAP
// ---------------------------------------------------------------------------

/** Normalize Figma component property key (strip #suffix, lowercase). */
export function normalizePropertyKey(rawKey: string): string {
  return rawKey.replace(/#.*$/, "").trim().toLowerCase()
}

export function isRawFigmaNodeId(value: unknown): boolean {
  return typeof value === "string" && NODE_ID_PATTERN.test(value)
}

/** Resolve INSTANCE_SWAP target id to Playbook icon glyph name. */
export function resolveInstanceSwapGlyph(
  swapValue: string,
  nodeIndex: Map<string, FigmaNode>,
  components: ComponentMap,
): string | undefined {
  const trimmed = swapValue.trim()
  if (!trimmed || SEE_APPEARANCES === trimmed.toLowerCase()) return undefined

  const fromTree = nodeIndex.get(trimmed)
  if (fromTree) return glyphNameFromNode(fromTree, components)

  const fromComponents = components[trimmed]
  if (fromComponents?.name) return sanitizeGlyphName(fromComponents.name)

  return undefined
}

function glyphNameFromNode(node: FigmaNode, components: ComponentMap): string | undefined {
  if (node.componentId && components[node.componentId]?.name) {
    return sanitizeGlyphName(components[node.componentId].name)
  }
  return sanitizeGlyphName(node.name)
}

function sanitizeGlyphName(name: string): string {
  return name.replace(/^\./, "").trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Instance prop extraction
// ---------------------------------------------------------------------------

export interface ExtractInstancePropsOptions {
  components?: ComponentMap
  nodeIndex?: Map<string, FigmaNode>
  /** Emit color: default and dark: false when present (Icon / full icon carriers). */
  includeDefaults?: boolean
  /** When set, only these Playbook prop names are extracted. */
  allowedProps?: ReadonlySet<string>
}

/**
 * Extract variant, boolean, text, and instance-swap props from Figma component properties.
 */
export function extractInstanceProps(
  node: FigmaNode,
  componentName: string,
  options: ExtractInstancePropsOptions = {},
): PlaybookProps {
  const props: PlaybookProps = {}
  if (!node.componentProperties) return props

  const {
    components = {},
    nodeIndex = new Map(),
    includeDefaults = false,
    allowedProps,
  } = options

  for (const [rawKey, prop] of Object.entries(node.componentProperties)) {
    const key = normalizePropertyKey(rawKey)
    let mappedName = PROP_NAME_MAP[key] ?? PROP_NAME_MAP[key.replace(/\s+/g, "")]
    if (!mappedName) continue
    if (allowedProps && !allowedProps.has(mappedName)) continue

    if (mappedName === "selected" && SELECTED_AS_CHECKED.has(componentName)) {
      mappedName = "checked"
    }

    if (prop.type === "VARIANT") {
      const raw = String(prop.value).trim()
      const lower = raw.toLowerCase()
      if (SEE_APPEARANCES === lower) continue
      if (!includeDefaults && SKIP_VALUES.has(lower)) continue
      if (includeDefaults && SKIP_VALUES.has(lower) && !DEFAULT_EMIT_PROPS.has(mappedName)) {
        continue
      }
      const strValue = mappedName === "size"
        ? (SIZE_VALUE_MAP[lower] ?? lower)
        : lower
      props[mappedName] = coerceValue(strValue)
    } else if (prop.type === "BOOLEAN") {
      if (prop.value === true) {
        props[mappedName] = true
      } else if (includeDefaults && mappedName === "dark") {
        props[mappedName] = false
      }
    } else if (prop.type === "TEXT") {
      const text = String(prop.value).trim()
      if (!text || SEE_APPEARANCES === text.toLowerCase()) continue
      props[mappedName] = text
    } else if (prop.type === "INSTANCE_SWAP" && mappedName === "icon") {
      const glyph = resolveInstanceSwapGlyph(String(prop.value), nodeIndex, components)
      if (glyph && !isRawFigmaNodeId(glyph)) props.icon = glyph
    }
  }
  return props
}

/** Coerce string values to proper JS types when appropriate. */
function coerceValue(value: string): string | number | boolean {
  if (value === "true") return true
  if (value === "false") return false
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  return value
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .replace(/^\./, "")
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("")
}

/**
 * Resolve a raw Figma name to its canonical Playbook component name.
 * Handles spaces, underscores, and "pb_" prefix variations.
 * Returns undefined if the name is not a known Playbook component.
 */
export function resolvePlaybookName(raw: string): string | undefined {
  const layerKey = raw.replace(/^\./, "").trim().toLowerCase()
  const isDottedSubcomponent = raw.trim().startsWith(".")
  if (
    isDottedSubcomponent
    && (layerKey === "icon" || layerKey === "iconselection" || layerKey === "iconinner")
  ) {
    return undefined
  }

  if (PLAYBOOK_NAMES.has(raw)) return raw
  const normalized = normalizeName(raw)
  if (PLAYBOOK_NAMES.has(normalized)) return normalized
  const stripped = normalized.replace(/^Pb/, "")
  if (stripped !== normalized && PLAYBOOK_NAMES.has(stripped)) return stripped
  return undefined
}

// ---------------------------------------------------------------------------
// BreadCrumbs assembly
// ---------------------------------------------------------------------------

/** Components valid as BreadCrumb content leaves. */
const CRUMB_CONTENT_NAMES: ReadonlySet<string> = new Set([
  "Title", "Body", "Link", "Caption",
])

/** Separator strings to discard from Figma internals. */
const CRUMB_SEPARATORS: ReadonlySet<string> = new Set([
  "/", ">", "›", "»", "·", "|",
])

/**
 * Build a complete BreadCrumbs spec from processed children.
 * Playbook BreadCrumbs CSS adds "/" separators automatically,
 * so Figma separator nodes are stripped. CSS overrides ensure
 * left-alignment and correct padding.
 */
export function buildBreadcrumbSpec(
  node: FigmaNode,
  children: SpecNode[],
): SpecNode {
  const crumbs = collectCrumbLeaves(children)
  const items: SpecNode[] = crumbs.map((crumb) => {
    if (crumb.component === "Title") {
      crumb.props = { ...crumb.props, tag: "span" }
    }
    return { component: "BreadCrumbItem", children: [crumb] }
  })

  const props: PlaybookProps = {}
  if (node.layoutMode) addResolvedPadding(node, props)

  const style: Record<string, string> = {
    justifyContent: "flex-start",
    padding: "0",
  }
  if (node.paddingTop) style.paddingTop = `${node.paddingTop}px`
  if (node.paddingRight) style.paddingRight = `${node.paddingRight}px`
  if (node.paddingBottom) style.paddingBottom = `${node.paddingBottom}px`
  if (node.paddingLeft) style.paddingLeft = `${node.paddingLeft}px`

  return { component: "BreadCrumbs", props, htmlOptions: { style }, children: items }
}

/** Walk depth-first and collect only meaningful leaf content. */
function collectCrumbLeaves(nodes: SpecNode[]): SpecNode[] {
  const result: SpecNode[] = []
  for (const node of nodes) {
    if (CRUMB_CONTENT_NAMES.has(node.component)) {
      if (node.text && CRUMB_SEPARATORS.has(node.text.trim())) continue
      result.push(node)
    } else if (node.children) {
      result.push(...collectCrumbLeaves(node.children))
    }
  }
  return result
}

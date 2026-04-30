import type { SpecNode } from "./types"

// ---------------------------------------------------------------------------
// Chrome detection — patterns from the Nitro global shell
// ---------------------------------------------------------------------------

const CHROME_NAME_PATTERNS = [
  /^NitroHeader$/i,
  /^Nitro\s*Logo$/i,
  /^(Left|Right)\s*Side\s*Bar$/i,
  /^Sidebar$/i,
  /^Side\s*Nav$/i,
  /^(Global|App)\s*Nav/i,
  /^Navigation$/i,
  /^Top\s*Bar$/i,
]

const NAV_ITEM_NAMES = new Set([
  "Accounting", "Business Intelligence", "Business Technologies",
  "Connect App", "Contact Center", "Corporate Finance",
  "Customer Development", "Digital Marketing Partners", "Emails",
  "Employee Health Check", "Equipment Assets", "Estimates",
  "Events", "Facilities", "Financing", "Homes", "Human Relations",
  "Initiatives", "Issuing Appointments", "Learning Dojo", "LinkShare",
  "Media", "Media Library", "Meetings", "Operations", "People",
  "Permits", "Playbook", "Portal", "Power Story", "PowerLife",
  "PowerLife on Demand", "Project Management", "Pulse", "Reports",
  "Runway", "Sales", "Sales Dashboard", "Scheduling", "Sessions",
  "Support Calls", "Support Tickets", "System Settings",
  "System Support", "Talent Acquisition", "Territories",
  "Test Pages", "Tournaments", "Training", "User Requests", "Users",
])

const TOP_BAR_TEXTS = new Set([
  "magnifying-glass", "Search", "phone-square", "Collapse Sidebar", "home",
])

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OptimizerOptions {
  skipChrome?: boolean
  flatten?: boolean
}

export function optimizeSpec(root: SpecNode, opts?: OptimizerOptions): SpecNode {
  const { skipChrome = true, flatten = true } = opts ?? {}
  let result = root
  if (skipChrome) result = stripChrome(result)
  if (flatten) result = flattenWrappers(result)
  result = normalizeRootFrame(result)
  result = groupFooterRows(result)
  result = normalizeSegmentedBorderRadii(result)
  result = flattenFormGroupWrappers(result)
  result = addPageContainerBottomPadding(result)
  result = sortPropsAlphabetically(result)
  return result
}

function normalizeRootFrame(root: SpecNode): SpecNode {
  if (root.component !== "_Frame") return root
  if (!root.children || root.children.length === 0) return root
  if (root.children.length === 1) {
    return {
      ...root.children[0],
      figmaName: root.children[0].figmaName ?? root.figmaName,
      figmaNodeId: root.children[0].figmaNodeId ?? root.figmaNodeId,
    }
  }

  return {
    component: "Flex",
    props: { orientation: "column" },
    figmaName: root.figmaName,
    figmaNodeId: root.figmaNodeId,
    dimensions: root.dimensions,
    children: root.children,
  }
}

// ---------------------------------------------------------------------------
// Pass 1: Strip chrome
//
// Strategy: at every level, check each child for chrome signals. If a child
// IS chrome (sidebar nav, top bar, or named chrome), remove it. Then recurse
// into the children we keep. This way the sidebar Card (51 nav items) is
// removed without killing its parent Flex (which also contains page content).
// ---------------------------------------------------------------------------

function collectTexts(node: SpecNode): string[] {
  const out: string[] = []
  if (node.text) out.push(node.text)
  node.children?.forEach((c) => out.push(...collectTexts(c)))
  return out
}

function isChromeName(name: string | undefined): boolean {
  if (!name) return false
  return CHROME_NAME_PATTERNS.some((re) => re.test(name))
}

/** True if this node is a sidebar nav (contains 5+ nav item labels). */
function isSidebarNav(node: SpecNode): boolean {
  const texts = collectTexts(node)
  return texts.filter((t) => NAV_ITEM_NAMES.has(t)).length >= 5
}

/** True if this node is the top bar row (search + phone + avatar). */
function isTopBar(node: SpecNode): boolean {
  const texts = collectTexts(node)
  return texts.filter((t) => TOP_BAR_TEXTS.has(t)).length >= 2
}

function isChrome(node: SpecNode): boolean {
  if (node.figmaName && isChromeName(node.figmaName)) return true
  if (isSidebarNav(node)) return true
  if (isTopBar(node)) return true
  return false
}

function stripChrome(node: SpecNode): SpecNode {
  if (!node.children) return node

  // RECURSE first so inner chrome is already gone before we evaluate
  // the heuristic at this level. Without this, a parent that *contains*
  // the sidebar deep inside would be mis-identified as chrome itself.
  const recursed = node.children.map((child) => stripChrome(child))
  const kept = recursed.filter((child) => !isChrome(child))

  return { ...node, children: kept.length ? kept : undefined }
}

// ---------------------------------------------------------------------------
// Pass 2: Flatten unnecessary wrappers
//
// Conservative strategy: only collapse wrappers that carry NO layout
// information. If a Flex has fill, fillCrossAxis, padding, gap, alignment,
// or background, it is structurally important and must be preserved.
// ---------------------------------------------------------------------------

/**
 * Playbook components that are visually meaningful without text or children.
 * These must NOT be removed by the "empty leaf" filter.
 */
const SELF_CONTAINED_COMPONENTS = new Set([
  "SectionSeparator", "Loading", "LoadingInline",
  "ProgressSimple", "DistributionBar", "SkeletonLoading",
])

function flattenWrappers(node: SpecNode): SpecNode {
  if (!node.children) return node

  let children = node.children.map(flattenWrappers)

  // Unwrap _Frame nodes — promote their children
  children = children.flatMap(unwrapFrame)

  // Drop empty leaves (no text, no children) — but keep self-contained components
  children = children.filter(
    (c) => c.text || c.children?.length || SELF_CONTAINED_COMPONENTS.has(c.component)
  )

  // Collapse: truly empty Flex (no props at all) with 1 child → promote child
  if (isTrivialWrapper(node) && children.length === 1) {
    return transferLayoutProps(node, children[0])
  }

  // Collapse: Flex → single child Flex → merge props (only if parent is trivial)
  if (
    node.component === "Flex" &&
    children.length === 1 &&
    children[0].component === "Flex" &&
    isTrivialWrapper(node)
  ) {
    return { ...children[0], props: mergeProps(node.props, children[0].props) }
  }

  return { ...node, children: children.length ? children : undefined }
}

function unwrapFrame(node: SpecNode): SpecNode[] {
  if (node.component === "_Frame") return node.children ?? []
  return [node]
}

/** Layout-significant props that mean a Flex wrapper should be preserved. */
const LAYOUT_PROPS = new Set([
  "fill", "fillCrossAxis", "gap", "padding",
  "paddingX", "paddingY", "background",
  "justify", "align",
])

/**
 * A Flex is trivial (safe to collapse) ONLY if it carries no layout-
 * significant props — just orientation or nothing at all.
 */
function isTrivialWrapper(node: SpecNode): boolean {
  if (node.component !== "Flex") return false
  if (!node.props) return true
  return Object.keys(node.props).every(
    (k) => k === "orientation"
  ) && !hasLayoutProps(node)
}

function hasLayoutProps(node: SpecNode): boolean {
  if (!node.props) return false
  return Object.keys(node.props).some((k) => LAYOUT_PROPS.has(k))
}

/**
 * When collapsing a trivial parent into its child, transfer any fill/
 * fillCrossAxis props that came from the parent's position in the tree.
 */
function transferLayoutProps(parent: SpecNode, child: SpecNode): SpecNode {
  const fillProps: Record<string, string | number | boolean> = {}
  if (parent.props?.fill) fillProps.fill = true
  if (parent.props?.fillCrossAxis) fillProps.fillCrossAxis = true

  if (Object.keys(fillProps).length === 0) return child

  return {
    ...child,
    props: { ...fillProps, ...child.props },
  }
}

function mergeProps(
  parent: Record<string, string | number | boolean> | undefined,
  child: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> | undefined {
  if (!parent) return child
  if (!child) return parent
  // Parent provides defaults, child overrides — but preserve parent-only keys
  return { ...parent, ...child }
}

// ---------------------------------------------------------------------------
// Pass 3: Group footer/summary rows into adjacent Cards
//
// Detects sibling pairs where:
//   - Sibling A is a Card
//   - Sibling B is a Flex with background + justify:"end" + currency/total text
// Moves sibling B inside A as the last child, so totals render as card footers.
// ---------------------------------------------------------------------------

const FOOTER_TEXT_PATTERN = /^(total|sum|subtotal|grand\s*total)$/i
const CURRENCY_PATTERN = /^\$[\d,.]+$/

function isFooterRow(node: SpecNode): boolean {
  if (node.component !== "Flex") return false
  if (!node.props?.background) return false
  const hasEndAlign = node.props?.justify === "end" || node.props?.align === "end"
  if (!hasEndAlign) return false

  const texts = collectTexts(node)
  return texts.some(
    (t) => FOOTER_TEXT_PATTERN.test(t.trim()) || CURRENCY_PATTERN.test(t.trim())
  )
}

function groupFooterRows(node: SpecNode): SpecNode {
  if (!node.children || node.children.length < 2) {
    if (node.children) {
      return { ...node, children: node.children.map(groupFooterRows) }
    }
    return node
  }

  // Recurse into children first
  const children = node.children.map(groupFooterRows)

  // Scan for Card + adjacent footer pairs and merge them
  const merged: SpecNode[] = []
  let i = 0
  while (i < children.length) {
    const current = children[i]
    const next = i + 1 < children.length ? children[i + 1] : undefined

    if (current.component === "Card" && next && isFooterRow(next)) {
      // Move footer inside the Card as the last child
      const cardChildren = [...(current.children ?? []), next]
      merged.push({ ...current, children: cardChildren })
      i += 2
    } else {
      merged.push(current)
      i++
    }
  }

  return { ...node, children: merged }
}

// ---------------------------------------------------------------------------
// Pass 4: Normalize segmented control border radii
//
// When sibling SelectableCards (possibly wrapped in Flex) have mixed
// htmlOptions.style.borderRadius values, cards WITHOUT borderRadius get
// "0" added. This completes the segmented control pattern where only the
// group's outer corners are rounded.
//
// The Figma API includes rectangleCornerRadii on nodes with non-uniform
// corners but omits it on uniform-radius siblings (whose values come from
// variables). This pass fills the gap so agents don't need manual fixes.
// ---------------------------------------------------------------------------

function normalizeSegmentedBorderRadii(node: SpecNode): SpecNode {
  if (!node.children) return node
  const children = node.children.map(normalizeSegmentedBorderRadii)

  const cards: SpecNode[] = []
  for (const child of children) {
    const card = findShallowSelectableCard(child)
    if (card) cards.push(card)
  }

  if (cards.length < 2) return { ...node, children }

  const withRadius = cards.filter((c) => c.htmlOptions?.style?.borderRadius)
  const withoutRadius = cards.filter((c) => !c.htmlOptions?.style?.borderRadius)

  if (withRadius.length > 0 && withoutRadius.length > 0) {
    for (const card of withoutRadius) {
      if (!card.htmlOptions) card.htmlOptions = { style: {} }
      card.htmlOptions.style.borderRadius = "0"
    }
  }

  return { ...node, children }
}

/** Find a SelectableCard at most 2 levels deep (handles Flex > SelectableCard). */
function findShallowSelectableCard(
  node: SpecNode,
  depth = 0,
): SpecNode | null {
  if (node.component === "SelectableCard") return node
  if (depth > 1 || !node.children) return null
  for (const child of node.children) {
    const found = findShallowSelectableCard(child, depth + 1)
    if (found) return found
  }
  return null
}

// ---------------------------------------------------------------------------
// Pass 5: Flatten FormGroup > Flex > SelectableCard wrappers
//
// Figma designers wrap each SelectableCard in a Frame for sizing control
// (flex: 1, alignment). Playbook's FormGroup with fullWidth already handles
// equal distribution, so these Flex wrappers break the expected API contract
// where SelectableCard must be a direct child of FormGroup.
//
// This pass promotes SelectableCards to direct children of FormGroup,
// discarding the intermediate Flex wrappers.
// ---------------------------------------------------------------------------

function flattenFormGroupWrappers(node: SpecNode): SpecNode {
  if (!node.children) return node
  const children = node.children.map(flattenFormGroupWrappers)

  if (node.component !== "FormGroup") {
    return { ...node, children }
  }

  const promoted = children.map(unwrapSelectableCard)
  return { ...node, children: promoted }
}

/**
 * If a node is a Flex wrapper containing exactly one SelectableCard,
 * promote the SelectableCard and discard the wrapper.
 */
function unwrapSelectableCard(node: SpecNode): SpecNode {
  if (node.component !== "Flex") return node
  if (!node.children || node.children.length !== 1) return node

  const child = node.children[0]
  if (child.component !== "SelectableCard") return node

  return child
}

// ---------------------------------------------------------------------------
// Pass 6: Add bottom padding to page-level container Flexes
//
// Figma designs often use fixed-height frames where the content doesn't
// fill the full height, creating visual bottom space. In the browser,
// flex:"1" containers stretch to fill the viewport — scrollable content
// would have no bottom breathing room without explicit padding.
//
// Heuristic: a vertical Flex that fills its parent (flex:"1"), has a
// visible background and gap between sections, but no bottom padding,
// gets paddingBottom matching its gap for consistent scroll-safe spacing.
// ---------------------------------------------------------------------------

function hasBottomPadding(props: Record<string, string | number | boolean>): boolean {
  return "padding" in props || "paddingY" in props || "paddingBottom" in props
}

function addPageContainerBottomPadding(node: SpecNode): SpecNode {
  if (!node.children) return node
  const children = node.children.map(addPageContainerBottomPadding)

  if (
    node.component === "Flex"
    && node.props
    && node.props.orientation === "column"
    && node.props.background
    && node.props.gap
    && node.props.flex === "1"
    && !hasBottomPadding(node.props)
  ) {
    return {
      ...node,
      props: { ...node.props, paddingBottom: node.props.gap as string },
      children,
    }
  }

  return { ...node, children }
}

// ---------------------------------------------------------------------------
// Pass 7: Sort props alphabetically
//
// ESLint's react/jsx-sort-props rule requires JSX props in alphabetical
// order. By sorting props in the spec, agents translating the spec into
// React code will produce correctly ordered props without manual effort.
// ---------------------------------------------------------------------------

function sortObject<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T
  for (const key of Object.keys(obj).sort()) {
    (sorted as Record<string, unknown>)[key] = obj[key]
  }
  return sorted
}

function sortPropsAlphabetically(node: SpecNode): SpecNode {
  const sorted: SpecNode = { ...node }
  if (sorted.props) {
    sorted.props = sortObject(sorted.props)
  }
  if (sorted.children) {
    sorted.children = sorted.children.map(sortPropsAlphabetically)
  }
  return sorted
}

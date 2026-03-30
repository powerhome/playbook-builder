/**
 * Figma Table component processing.
 *
 * Converts Figma Table instances into Playbook Table specs with
 * Table.Head, Table.Row, Table.Header, and Table.Cell sub-components.
 *
 * Figma Table structure:
 *   Table (INSTANCE)
 *     └─ Row (first child → header)
 *     │    └─ .TableCellComponent → .TableInnerSubContent → Text/Detail
 *     └─ Row (remaining → data rows)
 *          └─ .TableCellComponent → .TableInnerSubContent → Text/Icon
 */
import type { FigmaNode, SpecNode, VariableMap } from "./types"
import { extractAllTexts } from "./text-processor"
import { resolvePlaybookName } from "./instance-helpers"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a Table INSTANCE node into a Playbook Table spec.
 * First row becomes Table.Head with Table.Header cells.
 * Remaining rows become Table.Row with Table.Cell children.
 */
export function processTable(
  node: FigmaNode,
  _variables: VariableMap
): SpecNode {
  const rows = findRows(node.children)
  if (!rows.length) {
    return { component: "Table", figmaName: node.name }
  }

  const children: SpecNode[] = []
  const [headerRow, ...dataRows] = rows

  const headerSpec = buildHeaderRow(headerRow)
  if (headerSpec) {
    children.push({
      component: "Table.Head",
      children: [headerSpec],
    })
  }

  for (const row of dataRows) {
    children.push(buildDataRow(row))
  }

  return {
    component: "Table",
    props: { container: false, size: "sm" },
    children,
    figmaName: node.name,
  }
}

// ---------------------------------------------------------------------------
// Row discovery
// ---------------------------------------------------------------------------

/** Find direct child nodes that represent table rows. */
function findRows(children: FigmaNode[] | undefined): FigmaNode[] {
  if (!children) return []
  return children.filter(
    child => child.visible !== false && hasMultipleCells(child)
  )
}

/** A node is a row if it has multiple cell-like children. */
function hasMultipleCells(node: FigmaNode): boolean {
  return (node.children?.length ?? 0) >= 2
}

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

function buildHeaderRow(row: FigmaNode): SpecNode | null {
  const cells = row.children?.filter(c => c.visible !== false) ?? []
  if (!cells.length) return null

  const headerCells = cells.map(cell => {
    const texts = extractAllTexts(cell.children)
    const text = texts.join(" ").trim()
    return { component: "Table.Header", text: text || "" } as SpecNode
  })

  return { component: "Table.Row", children: headerCells }
}

// ---------------------------------------------------------------------------
// Data rows
// ---------------------------------------------------------------------------

function buildDataRow(row: FigmaNode): SpecNode {
  const cells = row.children?.filter(c => c.visible !== false) ?? []

  const dataCells = cells.map(cell => {
    const iconChild = findPlaybookIcon(cell)
    if (iconChild) return iconChild

    const texts = extractAllTexts(cell.children)
    const text = texts.join("\n").trim()
    return { component: "Table.Cell", text: text || "" } as SpecNode
  })

  return { component: "Table.Row", children: dataCells }
}

// ---------------------------------------------------------------------------
// Icon detection (e.g. CircleIconButton in action columns)
// ---------------------------------------------------------------------------

/**
 * Walk a cell looking for a recognized Playbook icon/button component.
 * Returns a Table.Cell wrapping the icon spec, or undefined if no icon found.
 */
function findPlaybookIcon(cell: FigmaNode): SpecNode | undefined {
  const icon = walkForIcon(cell)
  if (!icon) return undefined
  return {
    component: "Table.Cell",
    children: [icon],
  }
}

function walkForIcon(node: FigmaNode): SpecNode | undefined {
  if (node.type === "INSTANCE") {
    const resolved = resolvePlaybookName(node.name)
    if (resolved === "CircleIconButton" || resolved === "IconButton") {
      return {
        component: resolved,
        props: { icon: "pen", variant: "secondary" },
      }
    }
  }
  if (!node.children) return undefined
  for (const child of node.children) {
    const found = walkForIcon(child)
    if (found) return found
  }
  return undefined
}

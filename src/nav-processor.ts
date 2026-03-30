/**
 * Nav variant inference.
 *
 * Detects the Playbook Nav variant ("subtle", "bold") when Figma
 * componentProperties don't explicitly provide one.
 * Inspects navItem descendants for active-state styling clues.
 */
import type { FigmaNode } from "./types"

/**
 * Infer Nav variant when componentProperties didn't provide one.
 * Checks navItem descendants for active-state background fills to
 * distinguish subtle (very light rgba) from the default variant.
 */
export function inferNavVariant(node: FigmaNode): string | undefined {
  const items = collectNavItems(node.children)
  if (items.length === 0) return undefined

  for (const item of items) {
    if (hasSubtleActiveFill(item)) return "subtle"
  }
  return undefined
}

function collectNavItems(children: FigmaNode[] | undefined): FigmaNode[] {
  if (!children) return []
  const result: FigmaNode[] = []
  for (const child of children) {
    if (child.visible === false) continue
    const n = child.name?.replace(/^\./, "").toLowerCase() ?? ""
    if (n === "navitem") {
      result.push(child)
    } else if (child.children) {
      result.push(...collectNavItems(child.children))
    }
  }
  return result
}

/** Detect a very-low-opacity solid fill typical of the subtle active state. */
function hasSubtleActiveFill(node: FigmaNode): boolean {
  if (node.fills) {
    for (const fill of node.fills) {
      if (
        fill.type === "SOLID" &&
        fill.color &&
        fill.opacity != null &&
        fill.opacity < 0.1
      ) {
        return true
      }
    }
  }
  for (const child of node.children ?? []) {
    if (hasSubtleActiveFill(child)) return true
  }
  return false
}

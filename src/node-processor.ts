/**
 * Node processor orchestrator.
 *
 * Entry point for converting a Figma node tree into a Playbook spec tree.
 * Routes each node type to its specialized processor and manages the
 * parent-child sizing context that individual processors cannot access.
 *
 * Architecture:
 *   processTree (public API)
 *     └─ processNode (type-based dispatch)
 *          ├─ processText        → text-processor.ts
 *          ├─ processInstance    → instance-processor.ts
 *          └─ processFrame       → frame-processor.ts
 *     └─ processChildren (iteration + parent-relative sizing)
 *          └─ applySizingFromParent → dimension-resolver.ts
 */
import type {
  FigmaNode, SpecNode, VariableMap,
  ComponentMap, ChildrenProcessorFn,
} from "./types"
import { INTERNAL_COMPONENTS, isInternalComponent } from "./types"
import { processText } from "./text-processor"
import { processInstance } from "./instance-processor"
import { processFrame } from "./frame-processor"
import { addDimensions, applySizingFromParent } from "./dimension-resolver"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Walk the Figma node tree and emit a compact SpecNode tree. */
export function processTree(
  root: FigmaNode,
  components: ComponentMap,
  variables?: VariableMap,
): SpecNode {
  const vars = variables ?? new Map<string, string>()

  const processNodeFn = (node: FigmaNode): SpecNode =>
    processNode(node, components, vars)

  const processChildrenFn: ChildrenProcessorFn = (nodes, mode, align) =>
    processChildren(nodes, components, vars, mode, align)

  const spec = processNodeFn(root)
  addDimensions(root, spec)
  return spec
}

// ---------------------------------------------------------------------------
// Node dispatch
// ---------------------------------------------------------------------------

function processNode(
  node: FigmaNode,
  components: ComponentMap,
  variables: VariableMap,
): SpecNode {
  if (node.visible === false) {
    return { component: INTERNAL_COMPONENTS.HIDDEN, figmaName: node.name }
  }

  const childrenFn: ChildrenProcessorFn = (nodes, mode, align) =>
    processChildren(nodes, components, variables, mode, align)

  const frameFn = (n: FigmaNode): SpecNode =>
    processFrame(n, variables, childrenFn)

  switch (node.type) {
    case "TEXT":
      return processText(node, variables)

    case "INSTANCE":
      return processInstance(node, components, variables, frameFn, childrenFn)

    case "FRAME":
    case "GROUP":
    case "SECTION":
    case "COMPONENT":
    case "COMPONENT_SET":
      return processFrame(node, variables, childrenFn)

    default:
      return { component: INTERNAL_COMPONENTS.SHAPE, figmaName: node.name }
  }
}

// ---------------------------------------------------------------------------
// Children processing with parent-relative sizing
// ---------------------------------------------------------------------------

/**
 * Process child nodes and apply parent-relative sizing context.
 *
 * This is where Figma's layout sizing modes (FILL, HUG, FIXED)
 * are translated into Playbook props. Each child receives sizing
 * props based on its relationship to the parent layout direction.
 */
function processChildren(
  nodes: FigmaNode[] | undefined,
  components: ComponentMap,
  variables: VariableMap,
  parentLayoutMode?: string,
  parentCrossAlign?: string,
): SpecNode[] {
  if (!nodes) return []

  return nodes
    .map((n) => {
      const spec = processNode(n, components, variables)
      if (isInternalComponent(spec.component)) return spec

      if (parentLayoutMode) {
        applySizingFromParent(spec, n, parentLayoutMode, parentCrossAlign)
      }

      addDimensions(n, spec)
      return spec
    })
    .filter((n) => !isInternalComponent(n.component))
}

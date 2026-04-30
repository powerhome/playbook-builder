import type {
  FigmaFileResponse,
  PageSpec,
  PageSpecBundle,
  PageSpecSelection,
  VariableMap,
} from "./types"
import { parseFigmaUrl } from "./figma-client"
import { processTree } from "./node-processor"
import { optimizeSpec } from "./spec-optimizer"
import { compareSpecs } from "./spec-compare"

export interface SelectionInput {
  role: string
  url: string
  fileKey: string
  nodeId: string
}

export function parseSelectionArgs(argv: string[]): SelectionInput[] {
  const selections: SelectionInput[] = []

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--selection") continue

    const role = argv[i + 1]
    const url = argv[i + 2]
    if (!role || !url || role.startsWith("--") || url.startsWith("--")) {
      throw new Error("Each --selection requires a role and a Figma URL.")
    }

    const { fileKey, nodeId } = parseFigmaUrl(url)
    selections.push({ role, url, fileKey, nodeId })
    i += 2
  }

  return selections
}

export function assertSingleFigmaFile(selections: SelectionInput[]): string {
  const fileKey = selections[0]?.fileKey
  if (!fileKey) throw new Error("At least one --selection is required.")

  const mismatched = selections.find(selection => selection.fileKey !== fileKey)
  if (mismatched) {
    throw new Error("All --selection URLs must point to the same Figma file.")
  }

  return fileKey
}

export function buildPageSpecBundle(
  response: FigmaFileResponse,
  selections: SelectionInput[],
  target: "react" | "rails",
  variables: VariableMap,
  noOptimize = false,
): PageSpecBundle {
  const pageSelections = selections.map(selection => {
    const nodeData = response.nodes[selection.nodeId]
    if (!nodeData?.document) {
      throw new Error(`Selection "${selection.role}" was not found in the Figma API response.`)
    }

    let layout = processTree(nodeData.document, nodeData.components ?? {}, variables)
    if (!noOptimize) layout = optimizeSpec(layout)

    const spec: PageSpec = { target, layout }
    return {
      role: selection.role,
      nodeId: selection.nodeId,
      url: selection.url,
      spec,
    } satisfies PageSpecSelection
  })

  const bundle: PageSpecBundle = {
    target,
    fileKey: assertSingleFigmaFile(selections),
    selections: pageSelections,
  }

  const comparison = buildComparison(pageSelections)
  if (comparison) bundle.comparison = comparison

  return bundle
}

function buildComparison(selections: PageSpecSelection[]) {
  const delta = findSelection(selections, ["delta", "changed", "change"])
  const context = findSelection(selections, ["context", "page", "full-page", "parent"])
  if (!delta || !context) return undefined

  return compareSpecs(
    context.spec.layout,
    delta.spec.layout,
    context.role,
    delta.role,
  )
}

function findSelection(
  selections: PageSpecSelection[],
  roles: string[],
): PageSpecSelection | undefined {
  const normalizedRoles = new Set(roles.map(normalizeRole))
  return selections.find(selection => normalizedRoles.has(normalizeRole(selection.role)))
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase()
}

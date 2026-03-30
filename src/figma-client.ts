import type { FigmaFileResponse, FigmaVariablesResponse, VariableMap } from "./types"

const BASE_URL = "https://api.figma.com/v1"

/** Fetch one or more nodes from the Figma REST API. */
export async function fetchFigmaNodes(
  fileKey: string,
  nodeIds: string[],
  token: string,
  depth?: number
): Promise<FigmaFileResponse> {
  const params = new URLSearchParams({ ids: nodeIds.join(",") })
  if (depth !== undefined) params.set("depth", String(depth))

  const url = `${BASE_URL}/files/${fileKey}/nodes?${params}`
  const res = await fetch(url, {
    headers: { "X-Figma-Token": token },
  })

  if (!res.ok) {
    const status = String(res.status)
    throw new Error("Figma API responded with status " + status)
  }

  return res.json() as Promise<FigmaFileResponse>
}

/**
 * Fetch all local variables from a Figma file.
 * Builds a map of variableId → variable name for direct token resolution.
 * Falls back to an empty map on error (non-blocking — fuzzy matching is the fallback).
 */
export async function fetchFigmaVariables(
  fileKey: string,
  token: string
): Promise<VariableMap> {
  const url = `${BASE_URL}/files/${fileKey}/variables/local`
  try {
    const res = await fetch(url, {
      headers: { "X-Figma-Token": token },
    })
    if (!res.ok) return new Map()

    const data = (await res.json()) as FigmaVariablesResponse
    const map: VariableMap = new Map()
    for (const [id, variable] of Object.entries(data.meta.variables)) {
      map.set(id, variable.name)
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Parse a Figma design URL into fileKey and nodeId.
 *
 * Supports formats:
 *   https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
 *   https://www.figma.com/file/{fileKey}/{fileName}?node-id={nodeId}
 */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const parsed = new URL(url)
  const segments = parsed.pathname.split("/").filter(Boolean)

  // segments: ["design"|"file", fileKey, fileName]
  const fileKey = segments[1]
  if (!fileKey) {
    throw new Error("Could not extract fileKey from the provided Figma URL")
  }

  const nodeIdParam = parsed.searchParams.get("node-id")
  if (!nodeIdParam) {
    throw new Error("URL is missing the node-id query parameter")
  }

  // URL uses dashes (358-93336), API expects colons (358:93336)
  const nodeId = nodeIdParam.replace(/-/g, ":")

  return { fileKey, nodeId }
}

import { fetchFigmaNodes, fetchFigmaVariables, parseFigmaUrl } from "./figma-client"
import { processTree } from "./node-processor"
import { optimizeSpec } from "./spec-optimizer"
import type { PageSpec, SpecNode } from "./types"

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    url: get("--url"),
    target: (get("--target") ?? "react") as "react" | "rails",
    raw: argv.includes("--raw"),
    noOptimize: argv.includes("--no-optimize"),
    depth: get("--depth") ? parseInt(get("--depth")!, 10) : undefined,
  }
}

function usage(): never {
  process.stderr.write(
    "Usage: playbook-builder --url <figma-url> [options]\n\n" +
    "Flags:\n" +
    "  --url           Figma design URL (required)\n" +
    "  --target        Output target: react (default) or rails\n" +
    "  --raw           Output raw Figma REST API JSON\n" +
    "  --no-optimize   Skip chrome removal and node flattening\n" +
    "  --depth         Limit API traversal depth\n\n" +
    "Environment:\n" +
    "  FIGMA_TOKEN     Figma personal access token (required)\n\n" +
    "Output is written to stdout. Redirect to save:\n" +
    "  playbook-builder --url <url> > spec.json\n"
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) usage()

  const token = process.env.FIGMA_TOKEN
  if (!token) {
    process.stderr.write(
      "Error: FIGMA_TOKEN environment variable is required.\n" +
      "Generate one at: https://www.figma.com/developers\n"
    )
    process.exit(1)
  }

  const { fileKey, nodeId } = parseFigmaUrl(args.url)

  const [response, variables] = await Promise.all([
    fetchFigmaNodes(fileKey, [nodeId], token, args.depth),
    fetchFigmaVariables(fileKey, token),
  ])

  if (args.raw) {
    process.stdout.write(JSON.stringify(response, null, 2) + "\n")
    return
  }

  const nodeData = response.nodes[nodeId]
  if (!nodeData?.document) {
    process.stderr.write("Error: requested node not found in API response.\n")
    process.exit(1)
  }

  let layout = processTree(nodeData.document, nodeData.components ?? {}, variables)

  if (!args.noOptimize) {
    layout = optimizeSpec(layout)
  }

  const spec: PageSpec = { target: args.target, layout }
  process.stdout.write(JSON.stringify(spec, null, 2) + "\n")
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
  process.exit(1)
})

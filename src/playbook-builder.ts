import * as fs from "fs"
import * as path from "path"
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
    output: get("--output") ?? get("-o"),
    target: (get("--target") ?? "react") as "react" | "rails",
    raw: argv.includes("--raw"),
    stdout: argv.includes("--stdout"),
    noOptimize: argv.includes("--no-optimize"),
    depth: get("--depth") ? parseInt(get("--depth")!, 10) : undefined,
  }
}

function usage(): never {
  const message =
    "Usage: playbook-builder --url <figma-url> [options]\n\n" +
    "Flags:\n" +
    "  --url           Figma design URL (required)\n" +
    "  --output, -o    Output file path (default: auto in output/)\n" +
    "  --target        Output target: react (default) or rails\n" +
    "  --raw           Output raw Figma REST API JSON instead of processed spec\n" +
    "  --stdout        Print to terminal instead of writing to a file\n" +
    "  --no-optimize   Skip chrome removal and node flattening\n" +
    "  --depth         Limit API traversal depth\n\n" +
    "Environment:\n" +
    "  FIGMA_TOKEN     Figma personal access token (required)"
  console.error(message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.resolve(__dirname, "..", "output")

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function autoOutputPath(nodeId: string, raw: boolean): string {
  const safe = nodeId.replace(/[^a-zA-Z0-9-]/g, "-")
  const suffix = raw ? "raw" : "spec"
  return path.join(OUTPUT_DIR, `${safe}-${suffix}.json`)
}

function resolvedOutputPath(outPath: string): string {
  const resolved = path.resolve(outPath)
  if (!resolved.startsWith(OUTPUT_DIR)) {
    throw new Error("Output path must be within the output/ directory")
  }
  return resolved
}

function summarize(node: SpecNode, stats = { components: 0, textNodes: 0 }): typeof stats {
  stats.components++
  if (node.text) stats.textNodes++
  node.children?.forEach((c) => summarize(c, stats))
  return stats
}

function writeOutput(json: string, outPath: string): void {
  ensureOutputDir()
  const safePath = resolvedOutputPath(outPath)
  fs.writeFileSync(safePath, json + "\n")
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) usage()

  const token = process.env.FIGMA_TOKEN
  if (!token) {
    console.error("Error: FIGMA_TOKEN environment variable is required.")
    console.error("Generate one at: https://www.figma.com/developers")
    process.exit(1)
  }

  const { fileKey, nodeId } = parseFigmaUrl(args.url)
  console.error("Fetching node from file...")

  const [response, variables] = await Promise.all([
    fetchFigmaNodes(fileKey, [nodeId], token, args.depth),
    fetchFigmaVariables(fileKey, token),
  ])
  if (variables.size) {
    console.error("Resolved %d design variables.", variables.size)
  }

  if (args.raw) {
    const json = JSON.stringify(response, null, 2)
    if (args.stdout) {
      console.log(json)
      return
    }
    const outPath = args.output ?? autoOutputPath(nodeId, true)
    writeOutput(json, outPath)
    console.error("Wrote raw API response → %s", path.basename(outPath))
    return
  }

  const nodeData = response.nodes[nodeId]
  if (!nodeData?.document) {
    console.error("Error: requested node not found in API response.")
    process.exit(1)
  }

  let layout = processTree(nodeData.document, nodeData.components ?? {}, variables)

  const beforeStats = summarize(layout)
  if (!args.noOptimize) {
    layout = optimizeSpec(layout)
  }
  const afterStats = summarize(layout)

  const spec: PageSpec = { target: args.target, layout }
  const json = JSON.stringify(spec, null, 2)

  if (args.stdout) {
    console.log(json)
    return
  }

  const outPath = args.output ?? autoOutputPath(nodeId, false)
  writeOutput(json, outPath)

  console.error("Done! %d components, %d text nodes.", afterStats.components, afterStats.textNodes)
  if (!args.noOptimize && beforeStats.components !== afterStats.components) {
    const removed = beforeStats.components - afterStats.components
    console.error("Optimized: removed %d chrome/wrapper nodes.", removed)
  }
  console.error("Wrote %d lines → %s", json.split("\n").length, path.basename(outPath))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})

import { finalizePageSpecBundle } from "./bundle-finalize"
import { fetchFigmaNodes, fetchFigmaVariables, parseFigmaUrl } from "./figma-client"
import { finalizePageSpecEnvelope } from "./page-spec-envelope"
import { processTree } from "./node-processor"
import { optimizeSpec } from "./spec-optimizer"
import {
  assertSingleFigmaFile,
  buildPageSpecBundle,
  parseSelectionArgs,
} from "./spec-bundle"
import type { PageSpec, PageSpecInvocationMeta } from "./types"
import {
  EXIT_FIGMA_OR_RUNTIME,
  EXIT_NODE_NOT_FOUND,
  EXIT_NO_FIGMA_TOKEN,
  EXIT_USAGE,
} from "./exit-codes"

interface ParsedCli {
  url?: string
  selections: ReturnType<typeof parseSelectionArgs>
  target: "react" | "rails"
  raw: boolean
  noOptimize: boolean
  depth?: number
  playbookUiAiRoot?: string
}

function parseCli(argv: string[]): ParsedCli {
  const get = (flag: string) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }

  let selections: ReturnType<typeof parseSelectionArgs> = []
  try {
    selections = parseSelectionArgs(argv)
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
    process.exit(EXIT_USAGE)
  }

  return {
    url: get("--url"),
    selections,
    target: (get("--target") ?? "react") as "react" | "rails",
    raw: argv.includes("--raw"),
    noOptimize: argv.includes("--no-optimize"),
    depth: get("--depth") ? parseInt(get("--depth")!, 10) : undefined,
    playbookUiAiRoot: get("--playbook-ui-ai-root"),
  }
}

function usage(): never {
  process.stderr.write(
    "Usage: playbook-builder --url <figma-url> [options]\n\n" +
    "       playbook-builder --selection delta <figma-url> --selection context <figma-url> [options]\n\n" +
    "Flags:\n" +
    "  --url                 Figma design URL (required unless using --selection)\n" +
    "  --selection           Role + Figma URL; repeat for multi-selection bundles\n" +
    "  --target              Output target: react (default) or rails\n" +
    "  --raw                 Output raw Figma REST API JSON\n" +
    "  --no-optimize         Skip chrome removal and node flattening\n" +
    "  --depth               Limit API traversal depth\n" +
    "  --playbook-ui-ai-root Optional path to playbook-ui dist/ai (default: cwd/node_modules/playbook-ui/dist/ai)\n\n" +
    "Environment:\n" +
    "  FIGMA_TOKEN           Figma personal access token (required)\n\n" +
    "Exit codes: 0 ok, 1 usage/argv, 2 missing FIGMA_TOKEN, 3 Figma/network error, 4 node not found\n\n" +
    "Output is written to stdout. Redirect to save:\n" +
    "  playbook-builder --url <url> > spec.json\n"
  )
  process.exit(EXIT_USAGE)
}

function invocationForSelection(
  args: ParsedCli,
): PageSpecInvocationMeta {
  return {
    mode: "selection",
    target: args.target,
    raw: args.raw,
    noOptimize: args.noOptimize,
    depth: args.depth,
    selectionRoles: args.selections.map((s) => s.role),
  }
}

function invocationForUrl(args: ParsedCli): PageSpecInvocationMeta {
  return {
    mode: "url",
    target: args.target,
    raw: args.raw,
    noOptimize: args.noOptimize,
    depth: args.depth,
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const args = parseCli(argv)

  if (!args.url && args.selections.length === 0) usage()
  if (args.url && args.selections.length > 0) {
    process.stderr.write("Error: use either --url or --selection, not both.\n")
    process.exit(EXIT_USAGE)
  }

  const token = process.env.FIGMA_TOKEN
  if (!token) {
    process.stderr.write(
      "Error: FIGMA_TOKEN environment variable is required.\n" +
      "Generate one at: https://www.figma.com/developers\n"
    )
    process.exit(EXIT_NO_FIGMA_TOKEN)
  }

  const cwd = process.cwd()

  if (args.selections.length > 0) {
    let fileKey: string
    try {
      fileKey = assertSingleFigmaFile(args.selections)
    } catch (err) {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
      process.exit(EXIT_USAGE)
    }
    const nodeIds = [...new Set(args.selections.map((s) => s.nodeId))]

    const [response, variables] = await Promise.all([
      fetchFigmaNodes(fileKey, nodeIds, token, args.depth),
      fetchFigmaVariables(fileKey, token),
    ])

    if (args.raw) {
      process.stdout.write(JSON.stringify(response, null, 2) + "\n")
      return
    }

    let body
    try {
      body = buildPageSpecBundle(
        response,
        args.selections,
        args.target,
        variables,
        args.noOptimize,
      )
    } catch (err) {
      process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
      process.exit(EXIT_NODE_NOT_FOUND)
    }

    const bundle = finalizePageSpecBundle(body, {
      cwd,
      playbookUiAiRoot: args.playbookUiAiRoot,
      invocation: invocationForSelection(args),
    })
    process.stdout.write(JSON.stringify(bundle, null, 2) + "\n")
    return
  }

  let fileKey: string
  let nodeId: string
  try {
    ;({ fileKey, nodeId } = parseFigmaUrl(args.url!))
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
    process.exit(EXIT_USAGE)
  }

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
    process.exit(EXIT_NODE_NOT_FOUND)
  }

  let layout = processTree(nodeData.document, nodeData.components ?? {}, variables)

  if (!args.noOptimize) {
    layout = optimizeSpec(layout)
  }

  const spec: PageSpec = { target: args.target, layout }

  const withMeta = finalizePageSpecEnvelope(spec, {
    cwd,
    playbookUiAiRoot: args.playbookUiAiRoot,
    invocation: invocationForUrl(args),
  })

  const stdoutSpec = {
    ...withMeta.pageSpec,
    meta: withMeta.meta,
    warnings: withMeta.warnings,
  }
  process.stdout.write(JSON.stringify(stdoutSpec, null, 2) + "\n")
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.message : String(err)) + "\n")
  process.exit(EXIT_FIGMA_OR_RUNTIME)
})

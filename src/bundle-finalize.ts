import fs from "fs"
import path from "path"
import { collectBundleWarnings } from "./bundle-warnings"
import {
  loadPlaybookUiComponentNames,
  readPlaybookUiPackageVersion,
  resolvePlaybookUiAiDir,
} from "./playbook-ui-ai"
import type {
  PageSpecBundle,
  PageSpecBundleBody,
  PageSpecBundleMeta,
  PageSpecInvocationMeta,
  PlaybookUiAiMeta,
} from "./types"

export function readPlaybookBuilderVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json")
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string }
    return typeof pkg.version === "string" ? pkg.version : "0.0.0"
  } catch {
    return "0.0.0"
  }
}

/** Current stdout contract version for bundles and single-url specs (with meta). */
export const OUTPUT_SCHEMA_VERSION = 2

export function finalizePageSpecBundle(
  body: PageSpecBundleBody,
  opts: {
    cwd: string
    playbookUiAiRoot?: string
    invocation: PageSpecInvocationMeta
  },
): PageSpecBundle {
  const aiDir = resolvePlaybookUiAiDir(opts.cwd, opts.playbookUiAiRoot)
  let playbookNames: Set<string> | undefined
  let playbookUiAi: PlaybookUiAiMeta | undefined
  let playbookUiMissing = false

  if (aiDir) {
    playbookNames = loadPlaybookUiComponentNames(aiDir)
    playbookUiAi = {
      aiDir,
      packageVersion: readPlaybookUiPackageVersion(aiDir),
      componentNameCount: playbookNames.size,
    }
  } else {
    playbookUiMissing = true
  }

  const warnings = collectBundleWarnings(body, playbookNames, playbookUiMissing)
  const meta = buildBundleMeta(opts.invocation, playbookUiAi)

  return { ...body, meta, warnings }
}

function buildBundleMeta(
  invocation: PageSpecInvocationMeta,
  playbookUiAi?: PlaybookUiAiMeta,
): PageSpecBundleMeta {
  return {
    playbookBuilderVersion: readPlaybookBuilderVersion(),
    outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    invocation,
    playbookUiAi,
  }
}

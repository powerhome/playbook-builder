import fs from "fs"
import path from "path"

/** Resolve directory containing playbook-ui AI metadata (`index.json`). */
export function resolvePlaybookUiAiDir(cwd: string, explicitRoot?: string): string | undefined {
  const candidates: string[] = []
  if (explicitRoot) {
    const resolved = path.resolve(explicitRoot)
    candidates.push(resolved)
    candidates.push(path.join(resolved, "dist", "ai"))
  }
  candidates.push(path.join(cwd, "node_modules", "playbook-ui", "dist", "ai"))

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.json"))) return dir
  }
  return undefined
}

/** Load playbook-ui package version when ai dir is .../playbook-ui/dist/ai */
export function readPlaybookUiPackageVersion(aiDir: string): string | undefined {
  try {
    const pkgPath = path.join(aiDir, "..", "..", "package.json")
    const raw = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string }
    return typeof raw.version === "string" ? raw.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Extract Playbook component names from playbook-ui `dist/ai/index.json`.
 * Structure varies by release; we read common kit/component shapes only.
 */
export function extractPlaybookManifestComponentNames(data: unknown): Set<string> {
  const names = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) names.add(v.trim())
  }

  if (!data || typeof data !== "object") return names
  const root = data as Record<string, unknown>

  const ingestComponentsArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const c of arr) {
      if (typeof c === "string") add(c)
      else if (c && typeof c === "object" && typeof (c as { name?: string }).name === "string") {
        add((c as { name: string }).name)
      }
    }
  }

  ingestComponentsArray(root.components)

  if (Array.isArray(root.kits)) {
    for (const kit of root.kits) {
      if (!kit || typeof kit !== "object") continue
      ingestComponentsArray((kit as { components?: unknown }).components)
    }
  }

  return names
}

export function loadPlaybookUiComponentNames(aiDir: string): Set<string> {
  const indexPath = path.join(aiDir, "index.json")
  const raw = JSON.parse(fs.readFileSync(indexPath, "utf8"))
  return extractPlaybookManifestComponentNames(raw)
}

/** Whether `component` matches manifest entries (exact, dotted base, slash form). */
export function isKnownPlaybookComponent(component: string, manifestNames: Set<string>): boolean {
  if (manifestNames.has(component)) return true
  const base = component.split(".")[0]
  if (manifestNames.has(base)) return true
  const slashForm = component.replace(/\./g, " / ")
  if (manifestNames.has(slashForm)) return true
  return false
}

import type { PageSpecBundleBody, SpecNode, SpecWarning } from "./types"
import { isInternalComponent } from "./types"
import { LOW_SIMILARITY_THRESHOLD } from "./spec-compare"
import { isKnownPlaybookComponent } from "./playbook-ui-ai"

function collectTexts(node: SpecNode): string[] {
  const out: string[] = []
  if (node.text?.trim()) out.push(node.text.trim())
  for (const child of node.children ?? []) out.push(...collectTexts(child))
  return out
}

function walkComponents(node: SpecNode, visit: (name: string) => void): void {
  visit(node.component)
  for (const child of node.children ?? []) walkComponents(child, visit)
}

export function collectBundleWarnings(
  bundle: Pick<PageSpecBundleBody, "selections" | "comparison">,
  playbookManifestNames?: Set<string>,
  playbookUiAiMissing?: boolean,
): SpecWarning[] {
  const warnings: SpecWarning[] = []

  if (playbookUiAiMissing) {
    warnings.push({
      code: "PLAYBOOK_UI_AI_METADATA_UNAVAILABLE",
      message:
        "Could not find playbook-ui AI metadata (index.json). "
        + "Install playbook-ui in this project or pass --playbook-ui-ai-root. "
        + "Component name validation was skipped.",
    })
  }

  for (const sel of bundle.selections) {
    const layout = sel.spec.layout
    const role = sel.role

    if (!layout.children?.length) {
      warnings.push({
        code: "SPEC_EMPTY_CHILDREN",
        message: "Spec root has no children after processing; check Figma selection, --depth, or --no-optimize.",
        selectionRole: role,
      })
    }

    const texts = collectTexts(layout)
    if (texts.length === 0) {
      warnings.push({
        code: "SPEC_NO_TEXT",
        message: "No text nodes found in spec subtree; design may be purely graphical or over-stripped.",
        selectionRole: role,
      })
    }

    if (playbookManifestNames && playbookManifestNames.size > 0) {
      walkComponents(layout, (component) => {
        if (isInternalComponent(component)) return
        if (!isKnownPlaybookComponent(component, playbookManifestNames)) {
          warnings.push({
            code: "UNKNOWN_PLAYBOOK_COMPONENT",
            message: `Component "${component}" was not found in playbook-ui dist/ai index.json.`,
            selectionRole: role,
          })
        }
      })
    }
  }

  const cmp = bundle.comparison
  if (cmp && !cmp.matched && cmp.score !== undefined && cmp.score >= LOW_SIMILARITY_THRESHOLD) {
    warnings.push({
      code: "COMPARISON_AMBIGUOUS",
      message:
        `Delta vs context did not match, but similarity score (${cmp.score}) is above the low threshold; verify placement with MCP screenshot or selection bounds.`,
    })
  }

  return dedupeWarnings(warnings)
}

function dedupeWarnings(warnings: SpecWarning[]): SpecWarning[] {
  const seen = new Set<string>()
  const out: SpecWarning[] = []
  for (const w of warnings) {
    const key = `${w.code}|${w.selectionRole ?? ""}|${w.message}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

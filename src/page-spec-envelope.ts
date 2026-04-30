import { finalizePageSpecBundle } from "./bundle-finalize"
import type { PageSpec, PageSpecBundleBody, PageSpecEnvelope, PageSpecInvocationMeta } from "./types"

export function finalizePageSpecEnvelope(
  pageSpec: PageSpec,
  opts: {
    cwd: string
    playbookUiAiRoot?: string
    invocation: PageSpecInvocationMeta
  },
): PageSpecEnvelope {
  const body: PageSpecBundleBody = {
    target: pageSpec.target,
    fileKey: "",
    selections: [
      {
        role: "url",
        nodeId: "",
        url: "",
        spec: pageSpec,
      },
    ],
  }

  const finalized = finalizePageSpecBundle(body, opts)

  return {
    meta: finalized.meta,
    warnings: finalized.warnings,
    pageSpec,
  }
}

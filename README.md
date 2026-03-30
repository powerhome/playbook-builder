# playbook-builder

AI Guild tooling: agents, rules, and skills to prototype UIs from Figma using Playbook components. Consumes Playbook; not maintained by the Playbook design system team.

## Why this exists

The Figma MCP's `get_metadata` returns a sparse XML tree with no text content,
colors, spacing, or component props. The `get_design_context` compensates by
generating thousands of lines of Tailwind code, prop type definitions, and
system instructions -- most of which is noise.

This tool calls the **Figma REST API directly** (`GET /v1/files/:key/nodes`),
which returns the full node tree as JSON in a single request: text content,
auto-layout properties, fills, strokes, font info, and component references.

It then compresses that into a compact `PageSpec` JSON with:
- Actual text content on every node
- Playbook component names matched by Figma instance names
- Spacing tokens (not raw pixels)
- Layout orientation, gap, alignment, and padding

## Setup

```bash
# 1. Get a Figma personal access token
#    Go to: https://www.figma.com/developers → Personal access tokens
#    Create a token with file_content:read scope

# 2. Export it (add to your shell profile for persistence)
export FIGMA_TOKEN="figd_<your_personal_access_token>"
```

When developing from a git clone, the wrapper can run `npm install` and `npm run build` on first use if `dist/` is missing or stale.

### Test the TypeScript build

```bash
npm install && npm run build
```

### Test the npm package (no Figma API)

Simulates installing from a registry tarball and checks that the CLI runs from `node_modules/.bin`:

```bash
npm run test:package
```

### Test against Figma (integration)

With `FIGMA_TOKEN` set, run `playbook-builder` with a real design URL and confirm JSON under `output/` (or `--stdout`).

## Usage

```bash
# Produce a compact page spec → auto-saved to output/
playbook-builder --url "https://www.figma.com/design/abc123/MyFile?node-id=358-93336"

# Custom output filename (must be within output/)
playbook-builder --url "https://..." --output output/my-spec.json

# Output raw REST API JSON (for inspection / debugging)
playbook-builder --url "https://..." --raw

# Print to terminal instead of file (piping, debugging)
playbook-builder --url "https://..." --stdout

# Limit traversal depth
playbook-builder --url "https://..." --depth 5
```

## Flags

| Flag              | Required | Description                                         |
|-------------------|----------|-----------------------------------------------------|
| `--url`           | Yes      | Figma design URL with `node-id` query param         |
| `--output`, `-o`  | No       | Output file path (default: auto in `output/` dir)   |
| `--target`        | No       | `react` (default) or `rails`                        |
| `--raw`           | No       | Output the raw Figma REST API JSON                  |
| `--stdout`        | No       | Print to terminal instead of writing to a file       |
| `--no-optimize`   | No       | Skip chrome removal and node flattening              |
| `--depth`         | No       | Limit API traversal depth (default: full tree)       |

## Environment

| Variable      | Required | Description                          |
|---------------|----------|--------------------------------------|
| `FIGMA_TOKEN` | Yes      | Figma personal access token          |

## Output format

```json
{
  "target": "react",
  "layout": {
    "component": "Flex",
    "props": { "orientation": "column", "gap": "sm" },
    "children": [
      {
        "component": "Title",
        "props": { "size": 4, "bold": true },
        "text": "Project Summary"
      },
      {
        "component": "Caption",
        "props": { "color": "light", "size": "xs" },
        "text": "Project Number"
      },
      {
        "component": "Body",
        "props": { "color": "link" },
        "text": "38-67893"
      }
    ]
  }
}
```

## How it maps Figma → Playbook

| Figma node type | Detection                        | Playbook component          |
|-----------------|----------------------------------|-----------------------------|
| TEXT            | fontSize >= 20 + bold            | Title (size 3)              |
| TEXT            | fontSize >= 14 + bold            | Title (size 4)              |
| TEXT            | fontSize <= 12                   | Caption                     |
| TEXT            | fontSize < 14 + bold             | Detail                      |
| TEXT            | default                          | Body                        |
| INSTANCE        | name matches Playbook component  | That component              |
| FRAME           | auto-layout + card styling       | Card                        |
| FRAME           | auto-layout                      | Flex                        |
| FRAME           | static + card styling            | Card                        |
| FRAME           | generic container                | _Frame (informational)      |

## Optimization

By default, the output is optimized to remove noise:

1. **Chrome removal** — strips the NitroHeader, sidebar nav, and top bar
   (detected by known nav item labels and structural patterns)
2. **Node flattening** — collapses single-child Flex wrappers, removes
   empty `_Frame` nodes, and merges redundant nested Flex containers

On the Accounting Review page this reduces output from **5,900 → ~1,000 lines**
and **701 → 156 components** while preserving all 79 page text nodes.

Use `--no-optimize` to get the unfiltered output for debugging.

## Comparison with MCP workflow

| Aspect              | MCP workflow           | playbook-builder          |
|---------------------|------------------------|---------------------------|
| API calls           | 3-5 (screenshot +      | 1 (REST API)              |
|                     | metadata + design      | + 1 optional screenshot   |
|                     | context x N sub-nodes) |                           |
| Text content        | Read from screenshot   | Direct from JSON          |
| Spacing             | Inferred from Tailwind | Computed from px → tokens |
| Output size         | Thousands of lines     | ~200-1000 lines JSON      |
| Component matching  | Code Connect snippets  | Name-based matching       |

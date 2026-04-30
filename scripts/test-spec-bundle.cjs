const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { finalizePageSpecBundle } = require("../dist/bundle-finalize")
const {
  assertSingleFigmaFile,
  buildPageSpecBundle,
  parseSelectionArgs,
} = require("../dist/spec-bundle")
const { compareSpecs } = require("../dist/spec-compare")

const contextLayout = {
  component: "Flex",
  figmaName: "Settings Page",
  figmaNodeId: "1:1",
  children: [
    {
      component: "Card",
      figmaName: "Account Summary",
      figmaNodeId: "1:2",
      text: "Account summary",
    },
    {
      component: "Card",
      figmaName: "Past Due Banner",
      figmaNodeId: "1:3",
      children: [
        {
          component: "Body",
          figmaNodeId: "1:4",
          text: "Payment overdue",
        },
      ],
    },
  ],
}

const deltaLayout = {
  component: "Card",
  figmaName: "Past Due Banner",
  figmaNodeId: "1:3",
  children: [
    {
      component: "Body",
      figmaNodeId: "1:4",
      text: "Payment overdue",
    },
  ],
}

function run() {
  testSelectionParsing()
  testComparisonById()
  testComparisonFallback()
  testComparisonAllowsSizeDrift()
  testBundleAssembly()
  testFinalizeWithoutPlaybookUiAi()
}

function testSelectionParsing() {
  const selections = parseSelectionArgs([
    "--selection",
    "delta",
    "https://www.figma.com/design/file123/Test?node-id=1-3",
    "--selection",
    "context",
    "https://www.figma.com/design/file123/Test?node-id=1-1",
  ])

  assert.equal(selections.length, 2)
  assert.equal(selections[0].role, "delta")
  assert.equal(selections[0].nodeId, "1:3")
  assert.equal(assertSingleFigmaFile(selections), "file123")
}

function testComparisonById() {
  const result = compareSpecs(contextLayout, deltaLayout)

  assert.equal(result.matched, true)
  assert.equal(result.confidence, "high")
  assert.equal(result.strategy, "figmaNodeId")
  assert.deepEqual(
    result.path?.map(item => item.figmaName),
    ["Settings Page", "Past Due Banner"],
  )
  assert.equal(result.siblingHint?.index, 1)
  assert.equal(result.siblingHint?.before?.figmaName, "Account Summary")
}

function testComparisonFallback() {
  const contextWithoutIds = JSON.parse(JSON.stringify(contextLayout))
  const deltaWithoutIds = JSON.parse(JSON.stringify(deltaLayout))
  delete contextWithoutIds.children[1].figmaNodeId
  delete deltaWithoutIds.figmaNodeId
  contextWithoutIds.children[1].children[0].figmaNodeId = "9:9"
  deltaWithoutIds.children[0].figmaNodeId = "8:8"

  const result = compareSpecs(contextWithoutIds, deltaWithoutIds)

  assert.equal(result.matched, true)
  assert.equal(result.confidence, "high")
  assert.equal(result.strategy, "structuralSimilarity")
  assert.equal(result.score, 1)
}

function testComparisonAllowsSizeDrift() {
  const contextWithSizeDrift = JSON.parse(JSON.stringify(contextLayout))
  const deltaWithDifferentId = JSON.parse(JSON.stringify(deltaLayout))
  contextWithSizeDrift.children[1].figmaNodeId = "7:7"
  contextWithSizeDrift.children[1].dimensions = { width: 960, height: 120 }
  deltaWithDifferentId.figmaNodeId = "8:8"
  deltaWithDifferentId.dimensions = { width: 720, height: 100 }

  const result = compareSpecs(contextWithSizeDrift, deltaWithDifferentId)

  assert.equal(result.matched, true)
  assert.equal(result.strategy, "structuralSimilarity")
  assert.equal(result.path?.at(-1)?.figmaName, "Past Due Banner")
}

function testBundleAssembly() {
  const response = {
    name: "Test",
    lastModified: "2026-04-30T00:00:00Z",
    nodes: {
      "1:1": {
        document: {
          id: "1:1",
          name: "Settings Page",
          type: "FRAME",
          layoutMode: "VERTICAL",
          children: [
            {
              id: "1:3",
              name: "Past Due Banner",
              type: "FRAME",
              layoutMode: "VERTICAL",
              children: [
                {
                  id: "1:4",
                  name: "Banner Copy",
                  type: "TEXT",
                  characters: "Payment overdue",
                },
              ],
            },
          ],
        },
        components: {},
        styles: {},
      },
      "1:3": {
        document: {
          id: "1:3",
          name: "Past Due Banner",
          type: "FRAME",
          layoutMode: "VERTICAL",
          children: [
            {
              id: "1:4",
              name: "Banner Copy",
              type: "TEXT",
              characters: "Payment overdue",
            },
          ],
        },
        components: {},
        styles: {},
      },
    },
  }

  const selections = parseSelectionArgs([
    "--selection",
    "delta",
    "https://www.figma.com/design/file123/Test?node-id=1-3",
    "--selection",
    "context",
    "https://www.figma.com/design/file123/Test?node-id=1-1",
  ])
  const body = buildPageSpecBundle(response, selections, "react", new Map(), true)

  assert.equal(body.fileKey, "file123")
  assert.equal(body.selections.length, 2)
  assert.equal(body.comparison?.matched, true)
  assert.equal(body.comparison?.confidence, "high")

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-ui-ai-"))
  const aiDir = path.join(tmp, "dist", "ai")
  fs.mkdirSync(aiDir, { recursive: true })
  fs.writeFileSync(
    path.join(aiDir, "index.json"),
    JSON.stringify({
      kits: [
        {
          components: [{ name: "Flex" }, { name: "Card" }, { name: "Body" }],
        },
      ],
    }),
  )

  const bundle = finalizePageSpecBundle(body, {
    cwd: tmp,
    playbookUiAiRoot: aiDir,
    invocation: {
      mode: "selection",
      target: "react",
      raw: false,
      noOptimize: true,
      selectionRoles: ["delta", "context"],
    },
  })

  assert.equal(bundle.meta.outputSchemaVersion, 2)
  assert.ok(bundle.meta.playbookBuilderVersion.length > 0)
  assert.ok(bundle.meta.playbookUiAi)
  assert.ok(bundle.meta.playbookUiAi.componentNameCount >= 3)
  assert.ok(Array.isArray(bundle.warnings))

  fs.rmSync(tmp, { recursive: true, force: true })
}

function testFinalizeWithoutPlaybookUiAi() {
  const body = {
    target: "react",
    fileKey: "file123",
    selections: [
      {
        role: "delta",
        nodeId: "1:3",
        url: "https://www.figma.com/design/file123/Test?node-id=1-3",
        spec: {
          target: "react",
          layout: {
            component: "Flex",
            figmaNodeId: "1:3",
            children: [{ component: "Body", text: "Hello" }],
          },
        },
      },
    ],
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pb-no-ui-"))
  const bundle = finalizePageSpecBundle(body, {
    cwd: tmp,
    invocation: {
      mode: "selection",
      target: "react",
      raw: false,
      noOptimize: false,
      selectionRoles: ["delta"],
    },
  })

  assert.ok(
    bundle.warnings.some((w) => w.code === "PLAYBOOK_UI_AI_METADATA_UNAVAILABLE"),
  )

  fs.rmSync(tmp, { recursive: true, force: true })
}

run()

const assert = require("node:assert/strict")

const {
  extractInstanceProps,
  resolveInstanceSwapGlyph,
  normalizePropertyKey,
  isRawFigmaNodeId,
} = require("../dist/instance-helpers")
const { classifyIconCarrier } = require("../dist/icon-instance-props")
const { processTree } = require("../dist/node-processor")
const { optimizeSpec } = require("../dist/spec-optimizer")

function run() {
  testNormalizePropertyKey()
  testInstanceSwapResolvesGlyph()
  testInstanceSwapMissingTarget()
  testIconWithNestedDotIconUser()
  testIconWithNestedDotIconRocket()
  testIconWithIconInner()
  testIconSizeOnlyWithoutNestedCarrier()
  testIconDarkColorWithoutSwap()
  testButtonIconSelectionOnly()
  testIconSurvivesOptimizer()
  testClassifyIconCarrier()
}

function testNormalizePropertyKey() {
  assert.equal(normalizePropertyKey("Size"), "size")
  assert.equal(normalizePropertyKey("icon#11628:1"), "icon")
}

function testInstanceSwapResolvesGlyph() {
  const components = {
    "390:1059": { key: "a", name: "user" },
  }
  const index = new Map()
  const glyph = resolveInstanceSwapGlyph("390:1059", index, components)
  assert.equal(glyph, "user")
  assert.equal(isRawFigmaNodeId(glyph), false)
}

function testInstanceSwapMissingTarget() {
  const props = extractInstanceProps(
    {
      id: "1:1",
      name: ".icon",
      type: "INSTANCE",
      componentProperties: {
        "icon#1": { type: "INSTANCE_SWAP", value: "999:999" },
      },
    },
    "Icon",
    { components: {}, nodeIndex: new Map() },
  )
  assert.equal(props.icon, undefined)
}

function buildIconFixture({ swapId, swapName, size = "1x", color, dark }) {
  const components = {}
  if (swapId && swapName) {
    components[swapId] = { key: "glyph", name: swapName }
  }

  const iconChildProps = {
    "icon#1": { type: "INSTANCE_SWAP", value: swapId ?? "" },
  }
  if (color !== undefined) {
    iconChildProps["color#1"] = { type: "VARIANT", value: color }
  }
  if (dark !== undefined) {
    iconChildProps["dark#1"] = { type: "BOOLEAN", value: dark }
  }

  const document = {
    id: "405:1534",
    name: "Icon",
    type: "INSTANCE",
    componentId: "icon-main",
    componentProperties: {
      "Size#1": { type: "VARIANT", value: size },
    },
    children: swapId
      ? [{
        id: "405:1535",
        name: ".icon",
        type: "INSTANCE",
        componentId: "dot-icon",
        componentProperties: iconChildProps,
      }]
      : [],
  }

  return { document, components }
}

function testIconWithNestedDotIconUser() {
  const { document, components } = buildIconFixture({
    swapId: "390:1059",
    swapName: "user",
    color: "default",
    dark: false,
  })
  const spec = processTree(document, components)
  assert.equal(spec.component, "Icon")
  assert.equal(spec.props?.icon, "user")
  assert.equal(spec.props?.size, "1x")
  assert.equal(spec.props?.color, "default")
  assert.equal(spec.props?.dark, false)
  assert.equal(isRawFigmaNodeId(spec.props?.icon), false)
}

function testIconWithNestedDotIconRocket() {
  const { document, components } = buildIconFixture({
    swapId: "412:1119",
    swapName: "rocket",
    color: "default",
    dark: false,
  })
  const spec = processTree(document, components)
  assert.equal(spec.component, "Icon")
  assert.equal(spec.props?.icon, "rocket")
  assert.equal(spec.props?.size, "1x")
}

function testIconWithIconInner() {
  const components = { "glyph:check": { key: "c", name: "check" } }
  const document = {
    id: "2:26475",
    name: "Icon",
    type: "INSTANCE",
    componentProperties: { "Size#1": { type: "VARIANT", value: "1x" } },
    children: [{
      id: "2:26476",
      name: ".iconInner",
      type: "INSTANCE",
      componentProperties: {
        "icon#1": { type: "INSTANCE_SWAP", value: "glyph:check" },
      },
    }],
  }
  const spec = processTree(document, components)
  assert.equal(spec.props?.icon, "check")
  assert.equal(spec.props?.size, "1x")
}

function testIconSizeOnlyWithoutNestedCarrier() {
  const { document, components } = buildIconFixture({ swapId: null })
  const spec = processTree(document, components)
  assert.equal(spec.component, "Icon")
  assert.equal(spec.props?.size, "1x")
  assert.equal(spec.props?.icon, undefined)
}

function testIconDarkColorWithoutSwap() {
  const document = {
    id: "1:1",
    name: "Icon",
    type: "INSTANCE",
    componentProperties: { "Size#1": { type: "VARIANT", value: "lg" } },
    children: [{
      id: "1:2",
      name: ".icon",
      type: "INSTANCE",
      componentProperties: {
        "color#1": { type: "VARIANT", value: "default" },
        "dark#1": { type: "BOOLEAN", value: false },
      },
    }],
  }
  const spec = processTree(document, {})
  assert.equal(spec.props?.size, "lg")
  assert.equal(spec.props?.color, "default")
  assert.equal(spec.props?.dark, false)
  assert.equal(spec.props?.icon, undefined)
}

function testButtonIconSelectionOnly() {
  const components = { "390:1059": { key: "a", name: "user" } }
  const document = {
    id: "10:1",
    name: "Button",
    type: "INSTANCE",
    componentProperties: {
      "variant#1": { type: "VARIANT", value: "primary" },
    },
    children: [
      {
        id: "10:2",
        name: ".iconSelection",
        type: "INSTANCE",
        componentProperties: {
          "icon#1": { type: "INSTANCE_SWAP", value: "390:1059" },
          "color#1": { type: "VARIANT", value: "default" },
          "dark#1": { type: "BOOLEAN", value: false },
        },
      },
      {
        id: "10:3",
        name: "Label",
        type: "TEXT",
        characters: "Continue",
      },
    ],
  }
  const spec = processTree(document, components)
  assert.equal(spec.component, "Button")
  assert.equal(spec.props?.icon, "user")
  assert.equal(spec.props?.color, undefined)
  assert.equal(spec.props?.dark, undefined)
  assert.equal(spec.props?.size, undefined)
  assert.equal(spec.text, "Continue")
}

function testIconSurvivesOptimizer() {
  const { document, components } = buildIconFixture({
    swapId: "390:1059",
    swapName: "user",
  })
  const raw = processTree(document, components)
  const optimized = optimizeSpec(raw)
  assert.equal(optimized.component, "Icon")
  assert.equal(optimized.props?.icon, "user")
  assert.ok(!JSON.stringify(optimized).includes(".icon"))
}

function testClassifyIconCarrier() {
  const components = {}
  assert.equal(
    classifyIconCarrier({ id: "1", name: ".iconSelection", type: "INSTANCE" }, components),
    "selection",
  )
  assert.equal(
    classifyIconCarrier({ id: "2", name: ".iconInner", type: "INSTANCE" }, components),
    "full",
  )
}

run()
console.log("test-icon-instance-props: ok")

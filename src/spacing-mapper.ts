import type { FigmaPaint, FigmaVariableAlias, VariableMap } from "./types"

// ---------------------------------------------------------------------------
// Pixel → Playbook spacing token
// ---------------------------------------------------------------------------

const SPACING_MAP: [number, string][] = [
  [4, "xxs"],
  [8, "xs"],
  [16, "sm"],
  [24, "md"],
  [32, "lg"],
  [40, "xl"],
]

/** Map a pixel value to the nearest Playbook spacing token. */
export function mapSpacing(px: number | undefined): string | undefined {
  if (px === undefined || px === 0) return undefined
  let closest = SPACING_MAP[0]
  let minDiff = Infinity
  for (const entry of SPACING_MAP) {
    const diff = Math.abs(px - entry[0])
    if (diff < minDiff) {
      minDiff = diff
      closest = entry
    }
  }
  return closest[1]
}

// ---------------------------------------------------------------------------
// Pixel → Playbook borderRadius token
// ---------------------------------------------------------------------------

const BORDER_RADIUS_MAP: [number, string][] = [
  [0, "none"],
  [4, "sm"],
  [6, "md"],
  [8, "md"],
  [12, "lg"],
  [16, "lg"],
]

/** Map a pixel corner radius to a Playbook borderRadius token. */
export function mapBorderRadius(px: number | undefined): string | undefined {
  if (px === undefined) return undefined
  if (px === 0) return "none"
  let closest = BORDER_RADIUS_MAP[0]
  let minDiff = Infinity
  for (const entry of BORDER_RADIUS_MAP) {
    const diff = Math.abs(px - entry[0])
    if (diff < minDiff) {
      minDiff = diff
      closest = entry
    }
  }
  return closest[1]
}

/**
 * Detect non-uniform corner radii and return a CSS border-radius string.
 * Returns undefined when corners are uniform (handled by mapBorderRadius).
 * CSS order matches Figma API: top-left top-right bottom-right bottom-left.
 */
export function mapNonUniformBorderRadius(
  radii: [number, number, number, number] | undefined,
): string | undefined {
  if (!radii) return undefined
  if (radii.every((r) => r === radii[0])) return undefined
  return radii.map((r) => `${r}px`).join(" ")
}

// ---------------------------------------------------------------------------
// Pixel width → Playbook maxWidth token
// ---------------------------------------------------------------------------

const MAX_WIDTH_MAP: [number, string][] = [
  [360, "xs"],
  [540, "sm"],
  [720, "md"],
  [960, "lg"],
  [1200, "xl"],
]

const MAX_WIDTH_TOLERANCE = 40

/**
 * Map a fixed-width frame to a Playbook maxWidth token.
 * Only matches if the width is within tolerance of a known token.
 */
export function mapMaxWidth(px: number | undefined): string | undefined {
  if (px === undefined) return undefined
  for (const [target, token] of MAX_WIDTH_MAP) {
    if (Math.abs(px - target) <= MAX_WIDTH_TOLERANCE) return token
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Figma fill color → Playbook color token
// ---------------------------------------------------------------------------

const COLOR_DISTANCE_THRESHOLD = 55

const COLOR_TOKENS: [string, string][] = [
  ["#0056CF", "link"],
  ["#0060D6", "link"],     // alternate Nitro blue
  ["#0052CC", "link"],     // Jira-style blue
  ["#242B42", "default"],
  ["#687887", "light"],
  ["#A1B0BD", "lighter"],
  ["#DA0014", "error"],
  ["#C4000A", "error"],    // darker red variant
  ["#00CA74", "success"],
  ["#00A85A", "success"],  // darker green variant
  ["#FF9500", "warning"],
  ["#E68600", "warning"],  // darker amber variant
]

/**
 * Extract a Playbook color token from a fills array.
 * Returns the matched token including "default" so agents always emit
 * an explicit color prop on text components.
 */
export function mapColor(fills: FigmaPaint[] | undefined): string | undefined {
  if (!fills?.length) return undefined
  const fill = fills.find((f) => f.type === "SOLID" && f.visible !== false)
  if (!fill?.color) return undefined

  const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b)
  for (const [target, token] of COLOR_TOKENS) {
    if (hexDistance(hex, target) < COLOR_DISTANCE_THRESHOLD) {
      return token
    }
  }
  return undefined
}

/** Map a Figma alignment enum to a Playbook Flex prop value. */
export function mapAlignment(value: string | undefined): string | undefined {
  switch (value) {
    case "MIN":
      return "start"
    case "CENTER":
      return "center"
    case "MAX":
      return "end"
    case "SPACE_BETWEEN":
      return "between"
    case "STRETCH":
      return "stretch"
    case "BASELINE":
      return "baseline"
    default:
      return undefined
  }
}

/** True if the fills array contains a white (or near-white) solid fill. */
export function isWhiteFill(fills: FigmaPaint[] | undefined): boolean {
  if (!fills?.length) return false
  const fill = fills.find((f) => f.type === "SOLID" && f.visible !== false)
  if (!fill?.color) return false
  const { r, g, b } = fill.color
  // Figma colors are 0–1 floats; white is (1, 1, 1)
  return r > 0.95 && g > 0.95 && b > 0.95
}

// ---------------------------------------------------------------------------
// Figma fill color → Playbook background token
// ---------------------------------------------------------------------------

/**
 * Background token mapping uses TWO steps to avoid false positives:
 *
 * 1. Skip near-white fills (avg luminance > 0.98) — these are default backgrounds
 * 2. Match remaining fills against known background color tokens
 *
 * This prevents white Cards (#FFFFFF, #FAFBFC) from matching "light"
 * while still catching visible light grays (#F4F4F6, #E8EDF1).
 */
const BG_DISTANCE_THRESHOLD = 30

const BG_TOKENS: [string, string][] = [
  // Light / neutral grays — Playbook "light" background
  ["#F4F4F6", "light"],
  ["#F3F5F7", "light"],
  ["#E8EDF1", "light"],
  ["#EFF0F2", "light"],
  ["#E8E8E8", "light"],
  ["#F0F0F0", "light"],
  // Dark backgrounds
  ["#242B42", "dark"],
  ["#1B2236", "dark"],
  // Status backgrounds
  ["#0056CF", "primary"],
  ["#0060D6", "primary"],
  ["#DA0014", "error"],
  ["#C4000A", "error"],
  ["#00CA74", "success"],
  ["#00A85A", "success"],
  ["#FF9500", "warning"],
  ["#E68600", "warning"],
  ["#007BC1", "info"],
  ["#0091EA", "info"],
]

/** Near-white luminance threshold (0–1). Above this → default/white. */
const WHITE_LUMINANCE_CUTOFF = 0.98

export function mapBackgroundColor(
  fills: FigmaPaint[] | undefined
): string | undefined {
  if (!fills?.length) return undefined
  const fill = fills.find((f) => f.type === "SOLID" && f.visible !== false)
  if (!fill?.color) return undefined

  const { r, g, b, a: colorAlpha } = fill.color
  // Effective opacity = fill-level opacity × color alpha (both default to 1)
  const effectiveOpacity = (fill.opacity ?? 1) * (colorAlpha ?? 1)

  // Skip fully transparent fills
  if (effectiveOpacity < 0.01) return undefined

  // Semi-transparent fills → return as RGBA hint (agent maps via htmlOptions)
  if (effectiveOpacity < 0.95) {
    return formatRgba(r, g, b, effectiveOpacity)
  }

  // Skip near-white fills — they're the default background
  const luminance = (r + g + b) / 3
  if (luminance > WHITE_LUMINANCE_CUTOFF) return undefined

  const hex = rgbToHex(r, g, b)
  for (const [target, token] of BG_TOKENS) {
    if (hexDistance(hex, target) < BG_DISTANCE_THRESHOLD) {
      return token
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format Figma 0–1 floats as a CSS rgba() string. */
function formatRgba(r: number, g: number, b: number, a: number): string {
  const to255 = (n: number) => Math.round(n * 255)
  return `rgba(${to255(r)},${to255(g)},${to255(b)},${parseFloat(a.toFixed(2))})`
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

function hexDistance(a: string, b: string): number {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

// ---------------------------------------------------------------------------
// Variable-based token resolution (direct, no fuzzy matching)
// ---------------------------------------------------------------------------

/** Variable name suffix → Playbook text color token. */
const VAR_TEXT_COLOR_MAP: Record<string, string> = {
  text_lt_default: "default",
  text_lt_light: "light",
  text_lt_lighter: "lighter",
  text_dk_default: "default",
  text_dk_light: "light",
  primary_action: "link",
  error: "error",
  success: "success",
  warning: "warning",
}

/** Variable name suffix → Playbook background token. */
const VAR_BG_COLOR_MAP: Record<string, string> = {
  bg_light: "light",
  bg_dark: "dark",
  white: "white",
  card_light: "white",
  // neutral_subtle intentionally omitted — it's semi-transparent.
  // Falls through to mapBackgroundColor which computes the actual rgba() value.
  primary: "primary",
  "primary-action": "primary",
}

/**
 * Resolve a fill color to a Playbook token using variable bindings.
 * Returns the token if a variable ID matches a known pattern, otherwise undefined.
 * The caller should fall back to fuzzy RGB matching when this returns undefined.
 */
export function resolveColorFromVariable(
  boundVars: FigmaVariableAlias[] | undefined,
  variables: VariableMap
): string | undefined {
  if (!boundVars?.length || !variables.size) return undefined
  const varName = variables.get(boundVars[0].id)
  if (!varName) return undefined

  // Extract the last segment of the variable path (e.g. "text_lt_default")
  const suffix = varName.split("/").pop()?.toLowerCase() ?? ""
  return VAR_TEXT_COLOR_MAP[suffix]
}

/**
 * Resolve a background fill to a Playbook token using variable bindings.
 * Returns "rgba" when the variable is a semi-transparent color (e.g. neutral_subtle),
 * signaling the caller to use the actual RGBA value via htmlOptions.
 */
export function resolveBgFromVariable(
  boundVars: FigmaVariableAlias[] | undefined,
  variables: VariableMap
): string | undefined {
  if (!boundVars?.length || !variables.size) return undefined
  const varName = variables.get(boundVars[0].id)
  if (!varName) return undefined

  const suffix = varName.split("/").pop()?.toLowerCase() ?? ""
  return VAR_BG_COLOR_MAP[suffix]
}

// ---------------------------------------------------------------------------
// Figma REST API response types (subset of fields we consume)
// ---------------------------------------------------------------------------

export interface FigmaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaPaint {
  type: string
  color?: FigmaColor
  opacity?: number
  visible?: boolean
}

export interface FigmaTextStyle {
  fontFamily?: string
  fontWeight?: number
  fontSize?: number
  textAlignHorizontal?: string
  letterSpacing?: number
  lineHeightPx?: number
  textCase?: string
}

export interface FigmaBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FigmaVariableAlias {
  type: "VARIABLE_ALIAS"
  id: string
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]

  characters?: string
  style?: FigmaTextStyle

  fills?: FigmaPaint[]
  strokes?: FigmaPaint[]
  strokeWeight?: number
  cornerRadius?: number
  rectangleCornerRadii?: [number, number, number, number]
  opacity?: number

  layoutMode?: string
  itemSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  layoutSizingHorizontal?: string
  layoutSizingVertical?: string

  absoluteBoundingBox?: FigmaBoundingBox

  componentId?: string
  componentProperties?: Record<string, FigmaComponentProperty>
  boundVariables?: Record<string, FigmaVariableAlias[]>
}

export interface FigmaComponentProperty {
  type: string
  value: string | boolean
}

export interface FigmaComponent {
  key: string
  name: string
  description?: string
}

export type ComponentMap = Record<string, FigmaComponent>

// ---------------------------------------------------------------------------
// Figma REST API top-level response
// ---------------------------------------------------------------------------

export interface FigmaNodeResponse {
  document: FigmaNode
  components: Record<string, FigmaComponent>
  styles: Record<string, unknown>
}

export interface FigmaFileResponse {
  name: string
  lastModified: string
  nodes: Record<string, FigmaNodeResponse>
}

// ---------------------------------------------------------------------------
// Output spec types
// ---------------------------------------------------------------------------

export type PlaybookPropValue = string | number | boolean
export type PlaybookProps = Record<string, PlaybookPropValue>

export interface SpecNodeDimensions {
  width: number
  height: number
  sizingH?: string
  sizingV?: string
}

export interface SpecNode {
  component: string
  props?: PlaybookProps
  htmlOptions?: { style: Record<string, string> }
  text?: string
  figmaName?: string
  figmaNodeId?: string
  children?: SpecNode[]
  dimensions?: SpecNodeDimensions
}

export interface PageSpec {
  target: "react" | "rails"
  layout: SpecNode
}

export interface PageSpecSelection {
  role: string
  nodeId: string
  url: string
  spec: PageSpec
}

export interface SpecCompareBreadcrumb {
  component: string
  figmaName?: string
  figmaNodeId?: string
}

export interface SpecCompareSiblingHint {
  index: number
  count: number
  before?: SpecCompareBreadcrumb
  after?: SpecCompareBreadcrumb
}

export interface SpecCompareResult {
  deltaRole: string
  contextRole: string
  deltaRootId?: string
  matched: boolean
  confidence: "high" | "low" | "none"
  strategy: "figmaNodeId" | "textAndComponentPath" | "none"
  path?: SpecCompareBreadcrumb[]
  siblingHint?: SpecCompareSiblingHint
  message?: string
}

export interface PageSpecBundle {
  target: "react" | "rails"
  fileKey: string
  selections: PageSpecSelection[]
  comparison?: SpecCompareResult
}

// ---------------------------------------------------------------------------
// Internal placeholder component names (filtered during optimization)
// ---------------------------------------------------------------------------

export const INTERNAL_COMPONENTS = {
  HIDDEN: "_Hidden",
  SHAPE: "_Shape",
  FRAME: "_Frame",
} as const

export type InternalComponentName =
  typeof INTERNAL_COMPONENTS[keyof typeof INTERNAL_COMPONENTS]

export function isInternalComponent(name: string): boolean {
  return name === INTERNAL_COMPONENTS.HIDDEN
    || name === INTERNAL_COMPONENTS.SHAPE
    || name === INTERNAL_COMPONENTS.FRAME
}

// ---------------------------------------------------------------------------
// Processor context — replaces module-level mutable state
// ---------------------------------------------------------------------------

export interface ProcessorContext {
  readonly components: Readonly<ComponentMap>
  readonly variables: Readonly<VariableMap>
}

/** Callback to process a single node (injected to break circular deps). */
export type NodeProcessorFn = (node: FigmaNode) => SpecNode

/** Callback to process children with parent layout context. */
export type ChildrenProcessorFn = (
  nodes: FigmaNode[] | undefined,
  parentLayoutMode?: string,
  parentCrossAlign?: string,
) => SpecNode[]

// ---------------------------------------------------------------------------
// Figma Variables API types
// ---------------------------------------------------------------------------

export interface FigmaVariableValue {
  r?: number
  g?: number
  b?: number
  a?: number
}

export interface FigmaVariable {
  id: string
  name: string
  resolvedType: string
  valuesByMode: Record<string, FigmaVariableValue | number | string>
}

export interface FigmaVariablesResponse {
  status: number
  error: boolean
  meta: {
    variables: Record<string, FigmaVariable>
    variableCollections: Record<string, unknown>
  }
}

export type VariableMap = Map<string, string>

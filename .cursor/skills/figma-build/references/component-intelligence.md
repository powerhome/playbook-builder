# Component Intelligence

How playbook-builder and Figma MCP process Figma designs, what the spec can and can't provide, and component-specific patterns agents must recognize during builds. Read alongside [SKILL.md](../SKILL.md), [REFERENCE.md](./REFERENCE.md), and your framework's rule file ([react-build-rules.md](./react-build-rules.md) or [erb-build-rules.md](./erb-build-rules.md)).

---

## playbook-builder processor

### Pipeline

1. **Parse URL** → `fileKey` + `nodeId` (dashes → colons)
2. **Fetch** → Figma REST API: node tree + variables (parallel)
3. **Process tree** → each node dispatched by type → `SpecNode` tree
4. **Optimize** → strip Nitro chrome, flatten wrappers, group footers, sort props
5. **Write** → JSON spec to stdout (caller redirects to file; see SKILL.md Step 3)

### Node classification

| Figma type | Handler | Output |
|-----------|---------|--------|
| `TEXT` | Typography classifier | `Title`, `Body`, `Caption`, `Detail` (by fontSize + fontWeight) |
| `INSTANCE` | Name resolution → Playbook | Matched component or frame fallback |
| `FRAME` / `GROUP` | Auto-layout analysis | `Flex` (has layout) or `Card` (fill + stroke/radius) |
| Hidden nodes | Filtered out | — |

### Instance name resolution

1. Normalize Figma layer name: strip spaces, underscores, `pb_` prefix → PascalCase
2. Match against `PLAYBOOK_NAMES` set (120+ recognized components)
3. If no match: try `componentId` → main component name → normalize → match
4. If still no match: fall back to frame processing (produces `Flex` or `Card`)

**Implication for agents:** When a Figma component isn't in the Playbook set, the spec emits a generic `Flex` or `Card`. Agents should cross-check with the MCP screenshot if a node looks wrong.

### Typography classification

| Condition | Component |
|-----------|-----------|
| Bold + fontSize ≥ 20 | `Title` size 3 |
| Bold + fontSize ≥ 14 | `Title` size 4 |
| fontSize ≤ 12 | `Caption` size "xs" |
| Bold (other sizes) | `Detail` |
| Default | `Body` |

Color resolved from: Figma variable binding → suffix map → RGB fuzzy match → `"default"`.

### Design token resolution

**Spacing:** Nearest token from px values — 4→`xxs`, 8→`xs`, 16→`sm`, 24→`md`, 32→`lg`, 40→`xl`.

**Border radius:** px → `none`, `sm`, `md`, `lg` (with tolerance).

**maxWidth:** Fixed widths within ±40px of 360→`xs`, 540→`sm`, 720→`md`, 960→`lg`, 1200→`xl`.

**Text colors (variable-based):** Uses last path segment of variable name:

| Variable suffix | Token |
|----------------|-------|
| `text_lt_default`, `text_dk_default` | `"default"` |
| `text_lt_light`, `text_dk_light` | `"light"` |
| `text_lt_lighter` | `"lighter"` |
| `primary_action` | `"link"` |
| `error`, `success`, `warning` | Same name |

**Text colors (RGB fallback):** Fuzzy match against known hex values — `#242B42`→default, `#687887`→light, `#A1B0BD`→lighter, `#0056CF`→link, etc.

**Backgrounds (variable-based):** `bg_light`→`"light"`, `bg_dark`→`"dark"`, `white`/`card_light`→`"white"`, `primary`→`"primary"`. Semi-transparent variables (like `neutral_subtle`) fall through to RGBA.

**Backgrounds (RGB fallback):** Near-white fills (luminance > 0.98) are skipped. Semi-transparent fills may produce `rgba(...)` strings in the spec's `htmlOptions` field — agents should replace these with the nearest Playbook `background` token. Remaining fills match against `BG_TOKENS`.

### Spec optimizer passes

The optimizer runs automatically (disable with `--no-optimize`):

1. **Chrome removal** — strips Nitro shell elements (sidebar nav, top bar, header) by name patterns and heuristics (5+ nav item labels = sidebar)
2. **Flatten wrappers** — unwraps `_Frame` nodes, drops empty leaves, collapses trivial single-child `Flex` containers
3. **Group footer rows** — merges `Card` + adjacent total/subtotal `Flex` into card footer
4. **Segmented border radii** — normalizes `SelectableCard` siblings with mixed corner radii (adds `borderRadius: "0"` to inner cards)
5. **FormGroup flattening** — promotes `SelectableCard` through intermediate `Flex` wrappers to be direct `FormGroup` children
6. **Page padding** — adds `paddingBottom` to page-level vertical `Flex` containers with background + gap
7. **Prop sorting** — alphabetical order for `react/jsx-sort-props` compliance

### What the spec CANNOT provide

Agents must supply these manually:

| Component | What's missing | Agent action |
|-----------|---------------|--------------|
| `Select` | Dropdown options | Supply `options` prop (see framework rules) |
| `DatePicker` | `pickerId` / `picker_id` | Add unique DOM id (crashes without it) |
| `Typeahead` | Search options, async config | Supply options and `onChange` handler |
| `Table` (detached) | Not recognized as Table | Recognize Flex-row pattern, build as `Table` |
| `Nav` | Variant may be missing | Verify visually — sidebars are almost always `"subtle"` |
| `Timestamp` | DateTime value | Spec `text` is display text; use `new Date()` or `30.minutes.ago` |
| `Avatar` | Person's name | Spec `text` is layer name; use real name for initials |
| `DateRangeInline` | Actual Date objects | Spec `text` is display text only. Both `startDate`/`endDate` (React) or `start_date`/`end_date` (ERB) must be non-nil Date objects — nil crashes the Ruby component. For open-ended ranges showing "→ Current", use `Date.current` as end_date or display as `Body` text |
| Form handlers | Event handlers, state | Wire up per framework rules |

### Components playbook-builder frequently drops

Some Figma instances don't match the Playbook name set and fall through to generic Flex/Card — or are stripped entirely during optimization. **Always cross-check with MCP `get_design_context`** on sections likely to contain these:

| Component | Why it's dropped | How to detect via MCP |
|-----------|-----------------|----------------------|
| `Avatar` | Instance name doesn't match; often stripped as a small leaf node | MCP shows `<Avatar>` with `size`, `initials` in its output |
| `Icon` / `IconCircle` | Name mismatch or treated as decorative | MCP shows icon instances with `icon` prop |
| `User` / `UserBadge` | Composite component not in Playbook set | MCP shows Avatar + text grouping |

**Action:** During Step 3b, call `get_design_context` on activity/feed sections, user-facing panels, and any spec node that seems incomplete (e.g., a Flex row with text but no avatar where the screenshot shows one). Add missing components during Step 6.

### NavItem text extraction

NavItem instances contain both an icon (Font Awesome TEXT node) and a label TEXT node. The `extractText` function skips Font Awesome font-family TEXT nodes, but if the spec still shows an icon name (e.g., `"house"`, `"chevron-right"`) as the `text` for a NavItem, the label text was not extracted correctly. **Always cross-check NavItem text against the MCP screenshot** — use `get_screenshot` on the Nav section. Replace icon-name text with the actual navigation labels from the screenshot.

### Prop name mapping

The spec emits props using Playbook's API names, but agents sometimes substitute similar-sounding alternatives. **Use the exact prop name:**

| Spec prop | Correct Playbook prop | Common mistake |
|-----------|----------------------|----------------|
| `requiredIndicator: true` | `requiredIndicator` | `required` (different behavior) |
| `text` on Pill/Badge/Button | `text="value"` prop | Children `<Pill>value</Pill>` (Pill requires `text` prop) |
| `text` on TextInput/Textarea | `label="value"` prop | `text="value"` (not a valid prop) |
| `text` on Avatar | `name="value"` prop | `text="value"` (layer name, not display) |
| `text` on Timestamp | Ignore — use `timestamp={date}` | `text="30 minutes ago"` (static string) |
| `size` on Button | `size="md"` | Omitting it (default may differ) |

---

## Figma MCP

### Available tools

| Tool | Returns | Use for |
|------|---------|---------|
| `get_design_context` | React+Tailwind code, screenshot, contextual hints | Cross-checking ambiguous nodes, verifying component intent |
| `get_screenshot` | Screenshot image of a Figma node | Visual reference for layout verification, spotting missed backgrounds |
| `get_metadata` | File metadata | Checking file structure, page names |
| `get_figjam` | FigJam board content | Only for `figma.com/board/` URLs |

### When to use MCP

- **After fetching the spec** — MCP supplements the spec, never replaces it
- **Visual verification** — `get_screenshot` to confirm layout, colors, and spacing match
- **Ambiguous nodes** — `get_design_context` when a spec node seems wrong or incomplete
- **Nav variant check** — screenshot reveals whether sidebar navigation is subtle vs default

### MCP limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| Returns React+Tailwind, not Playbook | Code output is a reference, not copy-paste | Always translate to Playbook components/tokens |
| Raw hex colors | `#0056CF` instead of `color="link"` | Map using spec's resolved tokens |
| Placeholder text | "Nav Item" instead of real labels | Use spec `text` fields as source of truth |
| Absolute positioning | Pixel coordinates, not flex layouts | Use spec's `orientation`/`flex`/`gap` props |
| No design token resolution | CSS variables, not Playbook tokens | Rely on playbook-builder for token mapping |

---

## Component recognition patterns

### Detached tables

Figma sometimes represents tables as `Card > Flex` rows instead of a `Table` component. The spec optimizer does NOT convert these — agents must recognize and build them as `Table`.

How to recognize:
- `Card` with `padding="none"` containing multiple `Flex orientation="row"` children
- First row: `Caption color="light"` children (column headers)
- Subsequent rows: `Body` children (data cells)
- Rows share the same column count
- Often a `CircleIconButton` in the last cell (action column)

Build as:

```
Card (padding="none", width="100%")
  └── Table (container={false}, size="sm")
        ├── Table.Head > Table.Row > Table.Header (per column)
        └── tbody > Table.Row > Table.Cell (per data row)
```

**Carry over:** Card props (`borderRadius`, `padding="none"`, `width`), cell text verbatim, action buttons.
**Ignore:** Individual Flex cell wrappers — `Table.Cell` handles layout.

Multi-line cell content: render each value as a separate `Body` inside `Flex orientation="column"` — not `text="1\n2\n3"`.

### Background colors

The processor skips near-white fills and maps known grays/colors to Playbook tokens. **Always use the Playbook `background` prop** — never inline styles or hex values.

| Surface | Approach |
|---------|----------|
| White panels (sidebars, tab bars) | `background="white"` |
| Light gray content areas | `background="light"` |
| Dark content areas | `background="dark"` |
| Cards | Handle own white background — no extra styling |
| Tab nav bars | Wrap in a `Flex` or `Card` with `background="white"` |
| Semi-transparent fills | The spec may emit `htmlOptions` with `rgba(...)` — drop these and use the nearest Playbook `background` token instead |

**Adjacency rule:** If a Figma frame has a white fill AND it sits adjacent to a colored area, add `background="white"` explicitly. Without it, the panel may blend into its surroundings.

### Viewport-filling layouts

Use Playbook props for layout sizing. Drop visual details that have no Playbook equivalent rather than introducing inline styles.

| Need | Approach |
|------|----------|
| Full-page root | `height="100%"` on the root Flex, or `align="stretch"` on the parent |
| Sidebar full-height | `align="stretch"` on parent Flex |
| Root flex cross-axis | Use `align="stretch"` on the root row Flex so children fill the full height |
| Fixed sidebar width | Use `flex` ratios between siblings (e.g., `flex="1"` sidebar, `flex="4"` content) |
| Panel borders | Use `SectionSeparator` between panels, or a `Card` with its built-in border |

If a Figma layout absolutely cannot be expressed with Playbook props alone, use `htmlOptions` as a last resort with a comment explaining why. Do not use hardcoded pixel values or hex colors.

### Nav variant inference

The processor infers `variant="subtle"` by looking for NavItem descendants with low-opacity fills. When it can't infer:

| Visual indicator | Playbook variant |
|-----------------|-----------------|
| Simple text links, subtle active background | `variant="subtle"` |
| Standard nav with prominent active border | (default — no variant) |
| Heavier styling, collapsible sections | `variant="bold"` |

**Common mappings:**
- **Sidebar department/filter navigation** → `variant="subtle"` (most common miss)
- **Horizontal page tabs** → `orientation="horizontal"` (variant depends on visual weight)
- **Collapsible section navigation** → `variant="bold"`

Sidebar navigations are almost always `variant="subtle"`. Always verify with MCP screenshot if the spec omits `variant`.

### Content area maxWidth

The processor maps effective widths (from `absoluteBoundingBox`) within ±40px of known breakpoints — for both FIXED and FILL nodes. This means a FILL content column inside a ~720px parent correctly gets `maxWidth="md"`.

| Spec width | Token |
|-----------|-------|
| ~360px | `"xs"` |
| ~540px | `"sm"` |
| ~720px | `"md"` |
| ~960px | `"lg"` |
| ~1200px | `"xl"` |

Always pair with `margin="auto"` for centering.

**When maxWidth is still missing:** Full-width artboards (1440px) produce FILL content columns whose effective width exceeds all token tolerances. The spec emits `dimensions` but no `maxWidth`. Agents must detect this and add a constraint manually. See below.

### Page-root and full-width bar maxWidth anti-pattern

The spec's outermost node and full-width bars (headers, footers) often represent the full Nitro content area (1220px after sidebar removal). playbook-builder maps this to `maxWidth: "xl"` (1200px), but this **constrains the element to 1200px** — leaving a visible gap between it and the Nitro sidebar / page edges.

**Rule:** Any element that should be **edge-to-edge** in the Nitro shell must **never** have `maxWidth` or `margin="auto"`. This includes:

1. **The app's root Flex/Card** — the page background container
2. **Full-width header bars** — Cards with `borderRadius: "none"` spanning the top of the page
3. **Full-width footer bars** — bottom-edge elements

Only **centered content sections** (the inner card with the form, the content Flex) should have `maxWidth` constraints.

**How to detect:** If a full-width element has `maxWidth: "xl"` and its `dimensions.width` is close to the content area (1200–1240px), remove `maxWidth` and `margin="auto"` from that node. Compare against the MCP screenshot — if the element runs edge-to-edge with no visible gaps, it should not be constrained.

```tsx
// WRONG — header and page background capped at 1200px, visible gaps
<Flex background="light" maxWidth="xl" orientation="column" width="100%">
  <Card borderRadius="none" margin="auto" maxWidth="xl" paddingX="lg">
    {/* header content */}
  </Card>
  <Flex maxWidth="lg" ...>  {/* content — this one IS correct */}
</Flex>

// CORRECT — edge-to-edge elements fill viewport, only content is constrained
<Flex background="light" orientation="column" width="100%">
  <Card borderRadius="none" paddingX="lg" width="100%">
    {/* header content */}
  </Card>
  <Flex margin="auto" maxWidth="lg" ...>  {/* content — constrained */}
</Flex>
```

### Form pages without maxWidth

A form page centered in a 1440px artboard often has no `maxWidth` in the spec because the content FILLS the full artboard width (~1440px), which is outside all token tolerances.

**How to detect:** Check `dimensions.width` on the content column. If it is larger than 1240px (xl + tolerance) and the column contains form fields, maxWidth is missing.

**How to fix:**

| Form layout | Recommended maxWidth |
|------------|---------------------|
| Single-column form (fields stacked vertically) | `"md"` (720px) |
| Two-column form (side-by-side field pairs) | `"lg"` (960px) |
| Multi-section layout (sidebar + content) | `"xl"` (1200px) |

Apply `maxWidth` to the content wrapper Flex or Card (not the page root), and add `margin="auto"` for centering. Use the MCP screenshot to confirm the designer's intent — some pages are genuinely full-width (dashboards, data tables).

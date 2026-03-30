---
name: figma-build
description: Build a React or ERB page from a Figma design URL. Fetches design data via figma-fetch CLI, reads the optimized spec as the single source of truth, and generates modular Playbook components. Works with existing components (primary) or new ones (secondary). Use when the user provides a Figma URL and asks to build, create, or implement a page or component.
---

# Figma Build

Build a page from a Figma design URL into a Nitro component.

## Trigger

User provides a Figma URL and a target component directory.

## Choose your path

| Path | When to use | What happens |
|------|------------|--------------|
| **A: Existing component** (primary) | Component already exists in `components/` | Write files directly into the component's app directory |
| **B: New component** (secondary) | No suitable component exists | Run [setup-component.md](./references/setup-component.md) first, then follow Path A |

**Always prefer Path A.** Most Figma builds go into existing components.

---

## Path A: Build into an existing component

### Step 1: Parse inputs

| Input | Default | Notes |
|-------|---------|-------|
| `figmaUrl` | (required) | Must contain `node-id` param |
| `targetDir` | (required — ask user) | e.g., `components/accounting/` |
| `framework` | `react` | `react` or `rails` — detect from the component |

Extract `fileKey` and `nodeId` from the URL. Convert `node-id` dashes to colons: `358-93336` → `358:93336`.

**Detect framework:** Has `package.json` + `app/javascript/index.ts` → React. Has `helper Playbook::PbKitHelper` in controller → Rails ERB. Has both → ask user.

### Step 2: Figma API token

Try each method in order until one returns a non-empty value:

1. `source ~/.zshrc 2>/dev/null; echo $FIGMA_TOKEN | head -c 10`
2. `printenv FIGMA_TOKEN | head -c 10`
3. `grep -o 'FIGMA_TOKEN="[^"]*"' ~/.zshrc ~/.bashrc ~/.zprofile 2>/dev/null | head -1`

The Cursor sandbox may block `source ~/.zshrc` due to permission restrictions. Method 2 checks the inherited environment directly. Method 3 reads the token from dotfiles even if sourcing fails.

**If ALL methods return empty:** STOP and tell the user:
> "A Figma API token is required but not found in your environment or shell config files. Please generate one at https://www.figma.com/developers → Personal access tokens, then provide it so I can set it up."

Once the user provides a token, persist it:
```bash
echo 'export FIGMA_TOKEN="<token>"' >> ~/.zshrc
```

**Do NOT proceed to Step 3 until at least one method confirms the token exists.**

### Step 3: Fetch the spec

Detect the install context and run accordingly:

| Context | How to detect | Command | Output path |
|---------|--------------|---------|-------------|
| **npm package** (consuming repo) | `node_modules/figma-fetch/` exists | `npx figma-fetch --url "<figma-url>"` | `node_modules/figma-fetch/output/<nodeId>-spec.json` |
| **Git clone** (this repo) | `figma-fetch/src/` exists | `source ~/.zshrc && ./figma-fetch/bin/figma-fetch --url "<figma-url>"` | `figma-fetch/output/<nodeId>-spec.json` |

```bash
# npm package context (most common in consuming repos)
npx figma-fetch --url "<figma-url>"

# Git clone context (playbook-builder repo itself)
source ~/.zshrc && ./figma-fetch/bin/figma-fetch --url "<figma-url>"
```

The output file is always `<nodeId>-spec.json` inside the `output/` directory relative to the figma-fetch package root.

**CRITICAL — figma-fetch MUST succeed. If it fails for ANY reason, STOP immediately.** Do NOT proceed to Step 4 or beyond. Do NOT attempt to build from MCP data alone, guesswork, or memory. The spec is the single source of truth — without it, the build will be inaccurate.

**Diagnose the failure and explain it to the user:**

| Symptom | Likely cause | What to tell the user |
|---------|-------------|----------------------|
| 403 Forbidden | Token expired or revoked | "Your Figma API token is no longer valid. Please generate a new one at https://www.figma.com/developers → Personal access tokens." |
| 404 Not Found | Invalid file key or node ID | "The Figma URL doesn't point to a valid design node. Please verify the URL and ensure the `node-id` parameter is present." |
| Network / connection error | No internet or Figma API outage | "Unable to reach the Figma API. Please check your network connection and try again." |
| Empty or malformed output | figma-fetch bug or missing dependencies | "figma-fetch produced invalid output. If installed as a package, try `npm ls figma-fetch` to verify it's installed. If running from a git clone, try `cd figma-fetch && npm install && cd ..` then retry." |
| `FIGMA_TOKEN` not set | Token not in environment | "The Figma API token is not set in your environment. Please go back to Step 2." |
| Any other non-zero exit code | Unknown | "figma-fetch failed unexpectedly. Share the error output so we can diagnose it." |

**After the failure is resolved and figma-fetch succeeds,** resume from this step. Verify the output file exists and contains valid JSON before continuing.

### Step 3b: MCP cross-validation (mandatory)

Run MCP checks **immediately after fetching the spec** — do NOT defer to post-build. These catch components figma-fetch drops (Avatar, Icon, etc.) and layout details the spec can't fully capture.

1. **`get_screenshot`** — capture the full node for visual reference during build
2. **`get_design_context`** on 3–5 major sub-nodes (header, main content area, activity/footer, any section with avatars or icons). Compare MCP component names against spec components. **If MCP shows a component the spec omits** (e.g., Avatar, Icon), note it for manual addition in Step 6.
3. **Record a gap list** — write down every component/prop the MCP reveals that the spec missed. Carry this list into Step 6.

### Step 4: Read the spec

The spec is fully resolved — every prop is a direct Playbook prop. Key fields: `component`, `props`, `text`, `children`, `dimensions`, `htmlOptions`, `figmaName`. See [REFERENCE.md](./references/REFERENCE.md) for the complete spec field reference.

### Step 5: Plan the component breakdown

1. Identify 3-7 major sections (header, sidebar, main content, form, etc.)
2. Each section → one file, under 200 lines
3. Main component composes all sections
4. Use **only** text from spec `text` fields

#### Synthetic wrappers — get the sizing right

When you split a spec node's children into separate files, each sub-component introduces a root wrapper element **not in the spec**. This wrapper must inherit sizing from the **siblings it replaces**, not from the parent.

| Parent orientation | Wrapper needs | Why |
|-------------------|--------------|-----|
| `column` | `width="100%"` | Children in a column need full cross-axis width |
| `row` | `flex` or explicit width matching original children | Children in a row need correct main-axis sizing |

```
SPEC (flat):                     WRONG:
Flex (flex="1")                  Flex (flex="1")
  ├── A (width="100%")             ├── SubComponent
  ├── B (width="100%")             │   └── Flex (flex="1") ← duplicates parent
  └── C (width="100%")             └── ...

                                 CORRECT:
                                 Flex (flex="1")
                                   ├── SubComponent
                                   │   └── Flex (width="100%") ← matches replaced siblings
                                   └── ...
```

**Never duplicate the parent's `flex` on a synthetic wrapper.** Match the replaced children's `width`/`flex` props.

### Step 5b: Create a build task list (REQUIRED)

**Use the TodoWrite tool** to create a tracked task list before writing any code. This ensures no steps are skipped and progress is visible. Include these items at minimum:

1. Read [component-intelligence.md](./references/component-intelligence.md) and framework rule file
2. Inspect target component's existing files (routes, controllers, entrypoints, index.ts)
3. Create wiring files (controller, route, view/entrypoint)
4. Build each section partial/component (one todo per file)
5. Add mock data (typed fixtures from spec text for backend handoff)
6. Remove Nitro content padding (if full-width design)
7. Format and lint
8. Post-build audit: Phase 1 (spec-to-code prop audit)
9. Post-build audit: Phase 2 (MCP cross-validation with screenshots)
10. Post-build audit: Phase 3 (layout integrity)
11. Runtime verification (ask user to load page)

**Update each todo as you complete it.** Mark items `in_progress` when starting, `completed` when done. Do not proceed to runtime verification (Step 10) until all audit phases are complete.

### Step 6: Build the components

**CRITICAL: The spec is a blueprint, not a suggestion.**

#### Universal translation rules

1. **Every spec prop → a Playbook prop.** Copy verbatim.
2. **Never ADD props not in the spec.**
3. **Never OMIT props that ARE in the spec.**
4. **Spec nesting = component nesting.**
5. **Use spec text verbatim.**
6. **Use Playbook components exclusively** — never raw HTML.
7. **Keep files under 200 lines.**
8. **Use `dimensions` to compute flex ratios** between siblings with `sizingH: "FIXED"`.
9. **`htmlOptions`** — apply when spec has a top-level `htmlOptions` field.

#### Critical gotchas — these cause crashes and build failures

Consult the reference file linked in each row for full details.

| Gotcha | What goes wrong | Reference |
|--------|----------------|-----------|
| ERB sub-components use **slash notation** | `pb_rails("nav_item")` → crash. Use `pb_rails("nav/item")`, `table/table_row`, `flex/flex_item`, etc. | [erb-build-rules.md](./references/erb-build-rules.md) §3 |
| ERB `html_options` style must be a **CSS string** | Ruby hash keys produce invalid CSS (`background_color` ≠ `background-color`). Use `style: "background-color: white;"` | [erb-build-rules.md](./references/erb-build-rules.md) §2 |
| `DateRangeInline` needs **non-nil Date objects** | `nil` end_date → `NoMethodError` crash. Use `Date.current` for open-ended ranges or display as `Body` text | [component-intelligence.md](./references/component-intelligence.md) |
| `Select` needs **`options` prop**, not HTML children | `<option>` tags bypass Playbook styling — renders unstyled, borderless input | [erb-build-rules.md](./references/erb-build-rules.md) §5 / [react-build-rules.md](./references/react-build-rules.md) §4 |
| Detached tables: spec shows **Flex rows → build as `Table`** | `Card > Flex` row pattern = table. Build with `Table` + `Table.Row` + `Table.Cell` | [component-intelligence.md](./references/component-intelligence.md) |
| `textAlign` on **containers cascades** to all descendant text | Input labels, body text all center-aligned. Only apply to `Title`, `Body`, `Caption`, `Detail` | [component-intelligence.md](./references/component-intelligence.md) |
| `DatePicker` needs **`pickerId`** / `picker_id` | Missing DOM id → `document.querySelector(...) is null` crash | [react-build-rules.md](./references/react-build-rules.md) §1 / [erb-build-rules.md](./references/erb-build-rules.md) §9 |
| NavItem text may be **icon font names** | Spec may show `"house"` instead of the label. Cross-check with MCP screenshot | [component-intelligence.md](./references/component-intelligence.md) |
| Background colors need **explicit `htmlOptions`** | Playbook `background` prop is overridden by Nitro theme. Use `htmlOptions` for white panels, light gray areas | [component-intelligence.md](./references/component-intelligence.md) |
| Pill / Badge require **`text` prop** | Using JSX children or `do...end` block instead of `text="value"` breaks rendering | [react-build-rules.md](./references/react-build-rules.md) §7 / [erb-build-rules.md](./references/erb-build-rules.md) §8 |

#### Reference files — consult during build

These files contain the detailed rules, patterns, and wiring instructions for your framework. **Read the relevant file when you encounter a component or pattern from the gotchas table above**, when wiring files (routes, controllers, entrypoints), and when setting up form state or mock data.

| File | What it covers | When to consult |
|------|---------------|-----------------|
| [component-intelligence.md](./references/component-intelligence.md) | figma-fetch behavior, MCP guide, detached tables, backgrounds, Nav variants, synthetic wrappers, maxWidth | When a spec node looks ambiguous, when building tables/navs/backgrounds, during MCP cross-validation |
| [react-build-rules.md](./references/react-build-rules.md) | Component rules, htmlOptions skip list, explicit types, lint config, form state, wiring, troubleshooting | **React builds:** wiring entrypoints, form state, event handlers, lint/format |
| [erb-build-rules.md](./references/erb-build-rules.md) | snake_case conversion, sub-component naming, Select/form patterns, mock data, Turbo/Stimulus, wiring, troubleshooting | **ERB builds:** wiring controllers/routes, component naming, mock data, form patterns |
| [REFERENCE.md](./references/REFERENCE.md) | Spec field reference, component mapping table, shared troubleshooting | Quick lookups: "what does this spec field mean?", "what's the ERB name for X?" |

The `.cursor/rules/` workspace rules (`frontend-development.mdc`, `react-typescript.mdc`, `erb-templates.mdc`, etc.) are automatically applied by Cursor during editing. The reference files above **supplement** those rules with Figma-specific translation logic.

### Step 7: Remove Nitro content padding (full-width designs)

```erb
<style>
.page-container #main-view .main-page-content {
  padding: 0px !important;
}
</style>
```

### Step 8: Format and lint

See your framework's rule file for exact commands. CI will fail without this step.

### Step 9: Post-build audit (3 phases)

**This is not a spot-check.** Walk through every phase systematically. The build is not complete until all three phases pass.

#### Phase 1: Spec-to-code prop audit

Re-read the spec JSON alongside every component file. For each spec node:

1. **Every spec prop appears in code** — no omissions. Check `props`, `htmlOptions`, and `text` fields.
2. **Every spec `htmlOptions` is applied** — except the skip-list in your framework's rule file (e.g., no `htmlOptions` on `TextInput`, `Textarea`, `Select` in React).
3. **Prop names match Playbook API exactly** — see [component-intelligence.md](./references/component-intelligence.md) → "Prop name mapping". Common mistakes:
   - `required` → should be `requiredIndicator`
   - Pill/Badge `text` as children → should be `text="..."` prop
   - Button missing `size` prop
4. **`text` field mapping is correct** — `TextInput`/`Textarea` → `label`, `Pill`/`Badge`/`Button` → `text` prop, `Avatar` → `name`, `Timestamp` → `timestamp`
5. **Spec nesting preserved** — no flattened or collapsed intermediate Flex/Card wrappers

#### Phase 2: MCP cross-validation

Call `get_design_context` on 3–5 major sub-nodes (or use the gap list from Step 3b):

1. **Missing components** — any component MCP shows that the spec didn't (Avatar, Icon, etc.) must be added to code
2. **Layout structure** — confirm MCP's flex structure matches what you built
3. **Visual confirmation** — compare `get_screenshot` against your component hierarchy

#### Phase 3: Layout integrity

1. **Edge-to-edge elements** — the page-root container AND full-width bars (headers with `borderRadius="none"`, footers) must NOT have `maxWidth` or `margin="auto"`. They fill the Nitro shell viewport. Only centered content sections get `maxWidth`. See [component-intelligence.md](./references/component-intelligence.md) → "Page-root and full-width bar maxWidth anti-pattern".
2. **Flex ratios match dimensions** — FIXED siblings use `flex` ratios or `maxWidth` tokens proportional to their `dimensions.width`
3. **Content-level `maxWidth`** — centered content areas (the main form card, content Flex) should have `maxWidth` per spec, paired with `margin="auto"`. Do NOT confuse these with edge-to-edge elements from item 1.
4. **No hardcoded pixel widths** — use tokens or flex ratios
5. **Text `color` always explicit** — including `color="default"`
6. **Files under 200 lines**
7. **Mock data matches spec text** — no invented values. Tables/lists have 3-5 rows. Select options have 3-5 entries. All values sourced from spec `text` fields. Mock data is clearly marked with TODO comments for backend handoff.
8. **Check for linter errors** with ReadLints

### Step 10: Runtime verification

Ask the user to load the page URL and check the browser console. Fix crashes first, then warnings, then visual issues. See your framework's troubleshooting table for known patterns.

### Step 11: Functional scaffolding

A visually accurate page with placeholder handlers is not done. See your framework's rule file for form state, interactivity patterns, and backend connection guidance.

---

## Path B: Create a new component

**Only use when no existing component is suitable.** Always ask the user first.

Follow [setup-component.md](./references/setup-component.md) to create and wire the new component, then return to Path A Step 1.

---

## References

- [REFERENCE.md](./references/REFERENCE.md) — Spec field reference, component mapping, troubleshooting
- [component-intelligence.md](./references/component-intelligence.md) — figma-fetch processor behavior, MCP guide, component recognition patterns (detached tables, backgrounds, Nav variants, wrappers, maxWidth)
- [react-build-rules.md](./references/react-build-rules.md) — React/TypeScript: component rules, lint, explicit types, form state, wiring, patterns, troubleshooting
- [erb-build-rules.md](./references/erb-build-rules.md) — Rails ERB: component rules, snake_case, Select, Turbo/Stimulus forms, wiring, patterns, troubleshooting
- [setup-component.md](./references/setup-component.md) — New component creation (generator, Nitro wiring, CI checklists)

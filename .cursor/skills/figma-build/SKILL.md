---
name: figma-build
description: Translate a Figma design into view-layer Playbook components. Fetches design data via playbook-builder (terminal `npx`/binary or equivalent plugin or marketplace wrapper); reads the optimized spec as the single source of truth; generates modular UI (React TSX or ERB partials) with client-side interactivity. Also use for Path C — add, edit, or extend existing nitro-web pages or features from a scoped Figma delta, reconciling the spec into existing code. Does NOT generate application logic, Turbo wiring, or backend data processing. Use when the user provides a Figma URL (and often a target component directory) and asks to build, create, implement, extend, edit, or add UI.
---

# Figma Build

Translate a Figma design into view-layer Playbook components with client-side interactivity. Infrastructure (controllers, routes, entrypoints) either already exists (Path A) or is created by nitro-web's own generator (Path B). This skill never generates application logic, Turbo wiring, or backend data processing.

For a one-screen **design-to-code pipeline** diagram (Path → spec inventory → fetch PageSpec → MCP → patch → commits → audit), see **Design-to-code pipeline (agents)** in the repo [README.md](../../../README.md).

## Trigger

User provides a Figma URL and a target component directory, or asks to add,
edit, extend, or wire interaction behavior into an existing nitro-web page or
feature using a Figma design.

### Invoking playbook-builder

What matters is **successful PageSpec JSON** from `@powerhome/playbook-builder`
(Figma URL + `FIGMA_TOKEN`). Typical ways to run it:

- **Terminal:** `npx @powerhome/playbook-builder` or the installed `playbook-builder` binary (see Path A Step 3).
- **IDE / plugin marketplace:** A Cursor or nitro-web packaged action that invokes the same package or exposes the same fetch — for example tooling wired from **plugin-config** or your marketplace install.

Use whichever invocation your environment provides. **Do not** replace the official spec with MCP-only hand-building when this skill requires playbook-builder to succeed.

## Choose your path

| Path | When to use | What happens |
|------|------------|--------------|
| **A: Existing component** (primary) | Component already exists in `components/` | Write files directly into the component's app directory |
| **B: New component** (secondary) | No suitable component exists | Run [setup-component.md](./references/setup-component.md) first, then follow Path A |
| **C: Extend/edit existing page or feature** | User asks to add to, edit, replace, or add interactions to UI that already exists in nitro-web | Read the existing implementation first, run playbook-builder only on the scoped delta node when needed, then reconcile the spec into the existing page/feature |

**Always prefer Path A or C over Path B.** Most Figma builds go into existing
components. Use Path C when the task is an incremental change, not a greenfield
page build.

---

## Path C: Extend or edit an existing page or feature

Read [extend-existing-page.md](./references/extend-existing-page.md) before
building. Use this path when the user says or implies:

- "add this to an existing page", "insert this banner/card/section", "work this
  into the current screen", or "new element on an existing page"
- "change this feature", "update the existing component", "replace this
  section", or "make the built page match this design"
- "add to the feature we already made", "extend the flow", or "new
  step/state/dialog for this feature"
- "when they click", "show a modal", "loading/error/empty state", "multi-step",
  "tab behavior", "save/confirm/cancel"
- A full-page Figma URL is provided, but the user says only part of the page is
  new or changed

### Path C input model

| Input | Required? | Notes |
|-------|-----------|-------|
| `changeType` | recommended | One of `add_page_section`, `add_inside_feature`, `edit_page_section`, `edit_feature`, or `interaction_only` |
| `figmaUrl` | required for new/redesigned UI | Must point to the smallest practical node for the new or changed UI. Ask for a child `node-id` if the link points to the whole page. |
| `target` | required | App page, route, menu path, component pack, entry file, or feature name. Ask for one anchor if missing. |
| `placement` | optional | Insert/replace hint. If absent, infer from Figma order, screenshots, and existing component structure. |
| `interactionBrief` | required when behavior matters | Required when `changeType` is `interaction_only`, or when the user mentions clicks, modals, tabs, loading/error/empty states, multi-step flows, or save/persist. Optional for purely visual edits (props/layout/copy) with no behavior change. Include states, triggers, persistence, and existing APIs/callbacks if known. |

### Path C workflow

1. **Classify the request.** Decide whether this is page-level add/edit,
   feature-level add/edit, or interaction-only work. If it is actually a new
   isolated component with no existing nitro target, use Path B instead.
2. **Read existing implementation first.** Inspect the target page/feature files
   and one or two similar sections in the same component pack for file naming,
   props, callbacks, types, and composition.
3. **Reconcile Figma to code.** The spec is the source for Playbook components,
   props, spacing, layout intent, and copy. Existing nitro-web code is the
   source for file boundaries, data flow, exports, props, callbacks, and Rails
   vs React ownership. Match the design without mirroring Figma layer names into
   the repo.
4. **Scope the spec fetch.** For new/redesigned UI, run playbook-builder only on
   the small delta node (terminal, `npx`, or plugin/marketplace wrapper). Do not regenerate the full page unless the user
   explicitly asks for a full-page rebuild and accepts the wiring risk. When you
   fetch the spec for that delta, apply Path A Step 2 (token), Step 3 (spec fetch), and
   Step 3b (MCP) as spelled out in **Path C inherits Path A mechanics** — that
   subsection appears **after** **Incremental delivery and git commits** in this
   skill (same document order as Path A: token, JSON validation, MCP gap list on
   the delta node).
5. **Patch the existing subtree.** Add, replace, or edit the smallest page or
   feature subtree that satisfies the request. Preserve sibling sections,
   imports, props, callbacks, routes, Turbo frames, and existing behavior unless
   the brief explicitly changes them. **Commit** after each coherent unit of work
   (for example a new or replaced section file, then separately the parent
   import/composition if it is a distinct change). See **Incremental delivery and
   git commits** (subsection immediately after this workflow).
6. **Handle interactions within scope.** Client-side state, Playbook dialogs,
   tabs, collapse behavior, disabled/loading states, and named existing
   callbacks are in scope. New Rails endpoints, persistence contracts, Turbo
   streams, model queries, and authorization are out of scope unless the user
   explicitly asks for backend work. Stub or flag backend follow-up rather than
   inventing APIs.
7. **Run the same quality gates as Path A (scoped).** Follow the framework
   reference files, Playbook-only styling rules, file-size guidance,
   formatting/linting, and Path A Step 9 post-build audits. Apply Phase 1–3 to
   **every spec-backed subtree you added or changed** and to parent wiring you
   touched. You do not need to re-audit unrelated sections of the page that you
   did not modify. Extend/edit changes narrow the scope; they do not lower the
   bar. **Commit** after format/lint (same pattern as Path A Step 8). If audit
   fixes are large, put them in their own commit after the feature commits.

### Incremental delivery and git commits

Applies to **Path A**, **Path B then A**, and **Path C**. Goal: **minimal diffs**,
**spec scope identified before coding**, and **one logical commit per step** so
reviewers can read `git log` on a branch or PR and follow progress. Detailed
examples live in
[extend-existing-page.md](./references/extend-existing-page.md) → **Spec
inventory and atomic commits**.

1. **Spec inventory before coding.** List every `playbook-builder` run you plan
   (Figma URL + `node-id`) or state why the spec fetch is skipped (tiny prop tweak,
   `interaction_only` with no new UI from Figma). Do **not** commit spec JSON.
2. **Implement in small steps.** Touch the smallest set of files that satisfies
   the current slice of work; avoid unrelated refactors in the same commit as
   feature changes.
3. **Commit after each logical unit.** `git add` only files that belong to that
   step, then commit. Use imperative subjects, for example `feat: …`, `fix: …`,
   `style: …`, matching existing checkpoints in Path A Step 6 and Step 8.
4. **Path A parity.** Follow existing **Commit checkpoint** lines in Step 6
   (after each section file) and Step 8 (after format/lint).
5. **Path C parity.** Typical sequence: commit new/edited subtree files → commit
   parent wiring if it is a separate change → format/lint commit → optional
   separate commit for substantial audit-only fixes.
6. **Buildable commits.** Prefer each commit to leave the project in a sensible
   state (lint/typecheck expectations per repo). If an intermediate state cannot
   compile, combine steps or fix-forward in one commit rather than pushing broken
   milestones unless the user explicitly allows WIP commits.
7. **Permissions.** Creating commits requires **git write** access in the agent
   environment. If the user disallows git operations, output a numbered **proposed
   commit plan** (files + messages) for the developer to run locally.
8. **Squash merge.** Some teams squash PRs; atomic commits still help **during**
   branch review even if history collapses at merge.

### Path C inherits Path A mechanics

Canonical detail lives in [extend-existing-page.md](./references/extend-existing-page.md).
When `playbook-builder` runs for a Path C delta:

1. **Step 2 (token)** — Follow Path A Step 2. Do not fetch the spec without a valid
   `FIGMA_TOKEN`.
2. **Step 3 (spec fetch)** — Follow Path A Step 3: run `playbook-builder` (however your environment invokes it), validate JSON
   output, handle failures per Path A’s diagnosis table. Do not commit spec JSON.
3. **Step 3b (MCP)** — Follow Path A Step 3b **for the delta node**: screenshot,
   `get_design_context` on major sub-nodes of the delta, gap list for components
   the spec omits (e.g. Avatar, Icon). Skip Step 3b only if you did not run
   playbook-builder (for example `interaction_only` with no Figma delta).

Path A Steps 4–6 still apply to **building** the delta UI from the spec; Path C
adds **reconciliation** with existing files before and after that build.

### Path C translation rules vs Path A Step 6

Path A Step 6 says every spec prop must appear in code and warns against adding
props not in the spec. For Path C, follow this split:

- **Delta subtree from the spec:** Treat Path A Step 6 as written — preserve every
  emitted spec prop, nesting, and spec text for that subtree.
- **Integration glue:** You may add **minimal** extra props, types, ids, or
  callbacks required to attach that subtree to **existing parent or sibling
  contracts** (for example `onClick` wired to an existing handler, `pickerId` for
  `DatePicker`, props the parent already passes down). Do not add speculative
  props that are not required for integration or Playbook correctness.

### Path C question policy

Ask before coding when:

- You cannot identify where in nitro-web the change belongs from app page, URL,
  menu path, feature name, or visible copy.
- The Figma link is a full-page node but the request is scoped to part of the
  page.
- Interaction behavior includes persistence but does not say whether to keep it
  local, reuse an existing API/callback, or leave backend follow-up.
- Matching the spec would require replacing current data flow or callbacks.

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

You may run playbook-builder from a **shell** or through an **IDE/plugin or marketplace action** (for example in nitro-web or via plugin-config) as long as it produces the same JSON to stdout or into your editor.

Default shell invocation via `npx` (works from any repo):

```bash
npx @powerhome/playbook-builder --url "<figma-url>" > <nodeId>-spec.json
```

Output is written to stdout. Redirect to a file to save the spec. Use the nodeId (with colons replaced by dashes) as the filename, e.g. `358-93336-spec.json`.

Requires `~/.npmrc` with GitHub Packages auth and `@powerhome` registry mapping. See the playbook-builder README for setup.

**CRITICAL — playbook-builder MUST succeed. If it fails for ANY reason, STOP immediately.** Do NOT proceed to Step 4 or beyond. Do NOT attempt to build from MCP data alone, guesswork, or memory. The spec is the single source of truth — without it, the build will be inaccurate.

**Diagnose the failure and explain it to the user:**

| Symptom | Likely cause | What to tell the user |
|---------|-------------|----------------------|
| 403 Forbidden | Token expired or revoked | "Your Figma API token is no longer valid. Please generate a new one at https://www.figma.com/developers → Personal access tokens." |
| 404 Not Found | Invalid file key or node ID | "The Figma URL doesn't point to a valid design node. Please verify the URL and ensure the `node-id` parameter is present." |
| Network / connection error | No internet or Figma API outage | "Unable to reach the Figma API. Please check your network connection and try again." |
| Empty or malformed output | playbook-builder bug or missing dependencies | "playbook-builder produced invalid output. If installed as a package, try `npm ls @powerhome/playbook-builder` to verify it's installed. If running from a git clone, try `npm install` then retry." |
| `FIGMA_TOKEN` not set | Token not in environment | "The Figma API token is not set in your environment. Please go back to Step 2." |
| Any other non-zero exit code | Unknown | "playbook-builder failed unexpectedly. Share the error output so we can diagnose it." |

**After the failure is resolved and playbook-builder succeeds,** resume from this step. Verify the output contains valid JSON before continuing.

**Do NOT commit the spec JSON.** It is a transient build artifact — if needed again, re-run `playbook-builder` to fetch it.

### Step 3b: MCP cross-validation (mandatory)

Run MCP checks **immediately after fetching the spec** — do NOT defer to post-build. These catch components playbook-builder drops (Avatar, Icon, etc.) and layout details the spec can't fully capture.

1. **`get_screenshot`** — capture the full node for visual reference during build
2. **`get_design_context`** on 3–5 major sub-nodes (header, main content area, activity/footer, any section with avatars or icons). Compare MCP component names against spec components. **If MCP shows a component the spec omits** (e.g., Avatar, Icon), note it for manual addition in Step 6.
3. **Record a gap list** — write down every component/prop the MCP reveals that the spec missed. Carry this list into Step 6.

### Step 4: Read the spec

The spec is fully resolved — every prop is a direct Playbook prop. Key fields: `component`, `props`, `text`, `children`, `dimensions`, `figmaName`. The spec may also include `htmlOptions` — evaluate whether a Playbook prop can replace each one before using it. See [REFERENCE.md](./references/REFERENCE.md) for the complete spec field reference.

### Step 5: Plan the component breakdown

1. **Search nitro-web for existing patterns** — before building, search the target component and similar components for pages that solve similar UI problems. Reuse existing layout patterns, component choices, and conventions.
2. **Consult Playbook docs** — when unsure about a component's props, variants, or usage, check https://playbook.powerapp.cloud/ for the correct API.
3. Identify 3-7 major sections (header, sidebar, main content, form, etc.)
4. Each section → one file, under 200 lines
5. Main component composes all sections
6. Use **only** text from spec `text` fields

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
3. Record planned `playbook-builder` runs (each Figma URL + `node-id`) or state why the spec fetch is skipped — see **Incremental delivery and git commits**
4. **React:** Verify existing entrypoint and barrel export exist (read-only — do not generate) | **ERB:** Create minimal rendering controller + route if missing (see [erb-build-rules.md](./references/erb-build-rules.md) — just enough to display the page, no application logic)
5. Build each section partial/component (one todo per file)
6. Add mock data (typed fixtures from spec text for backend handoff)
7. If full-width design: add Nitro content padding override (see Step 7)
8. Format and lint
9. Post-build audit: Phase 1 (spec-to-code prop audit)
10. Post-build audit: Phase 2 (MCP cross-validation with screenshots)
11. Post-build audit: Phase 3 (layout integrity)

**Update each todo as you complete it.** Mark items `in_progress` when starting, `completed` when done. Do not proceed to handoff (Step 10) until all three post-build audit phases are complete.

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

#### Styling rules — Playbook only

**All styling MUST use Playbook component props.** No inline styles, no custom CSS classes, no hex values, no pixel values.

| Priority | Method | When |
|----------|--------|------|
| 1 | **Playbook props** | Always — spacing tokens, color props, `background`, `maxWidth`, `flex`, `width`, `height`, etc. |
| 2 | **`htmlOptions`** | Last resort — only when no Playbook prop exists for the visual need. Must be flagged with a comment explaining why. |
| 3 | **Drop the detail** | If it can't be expressed through Playbook props or a justified `htmlOptions`, skip it. |

**NEVER use:**
- `style={{}}` directly on components — use `htmlOptions` if absolutely necessary
- `className` for styling purposes
- Hardcoded hex color values — use Playbook color tokens
- Hardcoded pixel values — use Playbook spacing tokens or `flex` ratios
- `rgba(...)` values — use Playbook `background` tokens

If the spec emits `htmlOptions`, evaluate whether a Playbook prop can replace it. Only carry `htmlOptions` forward when no Playbook equivalent exists, and add a comment: `{/* htmlOptions: no Playbook prop for X */}`.

#### Critical gotchas — these cause crashes and build failures

Consult the reference file linked in each row for full details.

| Gotcha | What goes wrong | Reference |
|--------|----------------|-----------|
| ERB sub-components use **slash notation** | `pb_rails("nav_item")` → crash. Use `pb_rails("nav/item")`, `table/table_row`, `flex/flex_item`, etc. | [erb-build-rules.md](./references/erb-build-rules.md) §3 |
| ERB `html_options` must use **CSS string** if needed | Ruby hash keys produce invalid CSS (`background_color` ≠ `background-color`). Prefer Playbook props; if `html_options` is unavoidable, use string format | [erb-build-rules.md](./references/erb-build-rules.md) §2 |
| `DateRangeInline` needs **non-nil Date objects** | `nil` end_date → `NoMethodError` crash. Use `Date.current` for open-ended ranges or display as `Body` text | [component-intelligence.md](./references/component-intelligence.md) |
| `Select` needs **`options` prop**, not HTML children | `<option>` tags bypass Playbook styling — renders unstyled, borderless input | [erb-build-rules.md](./references/erb-build-rules.md) §5 / [react-build-rules.md](./references/react-build-rules.md) §4 |
| Detached tables: spec shows **Flex rows → build as `Table`** | `Card > Flex` row pattern = table. Build with `Table` + `Table.Row` + `Table.Cell` | [component-intelligence.md](./references/component-intelligence.md) |
| `textAlign` on **containers cascades** to all descendant text | Input labels, body text all center-aligned. Only apply to `Title`, `Body`, `Caption`, `Detail` | [component-intelligence.md](./references/component-intelligence.md) |
| `DatePicker` needs **`pickerId`** / `picker_id` | Missing DOM id → `document.querySelector(...) is null` crash | [react-build-rules.md](./references/react-build-rules.md) §1 / [erb-build-rules.md](./references/erb-build-rules.md) §9 |
| NavItem text may be **icon font names** | Spec may show `"house"` instead of the label. Cross-check with MCP screenshot | [component-intelligence.md](./references/component-intelligence.md) |
| Background colors — **use Playbook `background` prop** | Always use `background="white"`, `background="light"`, etc. Only fall back to `htmlOptions` if Playbook token doesn't exist | [component-intelligence.md](./references/component-intelligence.md) |
| Pill / Badge require **`text` prop** | Using JSX children or `do...end` block instead of `text="value"` breaks rendering | [react-build-rules.md](./references/react-build-rules.md) §7 / [erb-build-rules.md](./references/erb-build-rules.md) §8 |

**Commit checkpoint:** After each section file, commit: `git add <file> && git commit -m "feat: add <SectionName> component for <page-name>"`

#### Reference files — consult during build

These files contain the detailed rules and patterns for your framework. **Read the relevant file when you encounter a component or pattern from the gotchas table above**, when verifying wiring, and when setting up mock data.

| File | What it covers | When to consult |
|------|---------------|-----------------|
| [component-intelligence.md](./references/component-intelligence.md) | playbook-builder behavior, MCP guide, detached tables, backgrounds, Nav variants, synthetic wrappers, maxWidth | When a spec node looks ambiguous, when building tables/navs/backgrounds, during MCP cross-validation |
| [react-build-rules.md](./references/react-build-rules.md) | Component rules, explicit types, lint config, mock data, troubleshooting | **React builds:** verifying entrypoints, event handler types, lint/format |
| [erb-build-rules.md](./references/erb-build-rules.md) | snake_case conversion, sub-component naming, Select patterns, mock data, Stimulus, minimal rendering controller, troubleshooting | **ERB builds:** minimal controller/route, component naming, mock data, Stimulus patterns |
| [REFERENCE.md](./references/REFERENCE.md) | Spec field reference, component mapping table, shared troubleshooting | Quick lookups: "what does this spec field mean?", "what's the ERB name for X?" |

The `.cursor/rules/` workspace rules (`frontend-development.mdc`, `react-typescript.mdc`, `erb-templates.mdc`, etc.) are automatically applied by Cursor during editing. The reference files above **supplement** those rules with Figma-specific translation logic.

### Step 7: Remove Nitro content padding (if full-width design)

**Only if the design is edge-to-edge** (no side margins between content and the Nitro shell), add this CSS override to the main view:

```erb
<style>
.page-container #main-view .main-page-content {
  padding: 0px !important;
}
</style>
```

Skip this step if the design has a centered content area with visible margins.

### Step 8: Format and lint

See your framework's rule file for exact commands. CI will fail without this step.

**Commit checkpoint:** `git add -A && git commit -m "style: format <page-name> components"`

### Step 9: Post-build audit (3 phases)

**This is not a spot-check.** Walk through every phase systematically. The build is not complete until all three phases pass.

#### Phase 1: Spec-to-code prop audit

Re-read the spec JSON alongside every component file. For each spec node:

1. **Every spec prop appears in code** — no omissions. Check `props` and `text` fields.
2. **No inline styles or custom classes** — verify no `style={{}}`, no `className` for styling, no hardcoded hex/pixel values. Any `htmlOptions` usage must have a comment justifying why no Playbook prop exists.
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

### Step 10: Handoff

The build is complete. The generated files are view-layer only — Playbook components with correct props, layout, text, and client-side interactivity.

**Ask the user to load the page** and check the browser console. Fix crashes first, then warnings, then visual issues. See your framework's troubleshooting table for known patterns.

**What the developer owns from here:**

- Form submission and data persistence (Turbo, `form_with`, GraphQL mutations, REST endpoints)
- Server-side data loading (controller actions, model queries, GraphQL queries)
- Turbo Frames for partial page updates (the code includes `TODO` comments where these belong)
- State management beyond client-side UI interactions

---

## Path B: Create a new component

**Only use when no existing component is suitable.** Always ask the user first.

Follow [setup-component.md](./references/setup-component.md) — the developer runs nitro-web's generator, then you return to Path A Step 1 to build the UI.

---

## References

- [REFERENCE.md](./references/REFERENCE.md) — Spec field reference, component mapping, troubleshooting
- [component-intelligence.md](./references/component-intelligence.md) — playbook-builder processor behavior, MCP guide, component recognition patterns (detached tables, backgrounds, Nav variants, wrappers, maxWidth)
- [extend-existing-page.md](./references/extend-existing-page.md) — Add/edit existing nitro pages or features; interaction handoffs; prompt templates; spec inventory and atomic commits; Figma-to-code reconciliation
- [react-build-rules.md](./references/react-build-rules.md) — React/TypeScript: component rules, lint, explicit types, mock data, patterns, troubleshooting
- [erb-build-rules.md](./references/erb-build-rules.md) — Rails ERB: component rules, snake_case, Select, Stimulus, minimal rendering controller, mock data, troubleshooting
- [setup-component.md](./references/setup-component.md) — New component creation (delegates to nitro-web generator)

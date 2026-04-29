# Extend Existing Pages and Features

Use this reference when a Figma handoff changes UI that already exists in
nitro-web. This includes adding a new section to a page, adding UI inside an
existing feature, redesigning a shipped feature, or documenting interaction
states for a current workflow.

This is a workflow guide for agents and humans. It does not change what
`playbook-builder` emits: each invocation still yields one spec for one Figma `node-id`.

## Documentation map

- **[SKILL.md](../SKILL.md) Path C:** Routing, trigger phrases, input model
  (`changeType`, `figmaUrl`, `interactionBrief`), inheritance from Path A Steps
  2–3b when the spec fetch runs, glue-prop rules vs Path A Step 6, and question policy.
  Start there if you only need the decision tree.
- **This reference:** Deeper onboarding for agents new to nitro-web, templates,
  edge cases, spec fetch + MCP expectations, and framework parity (React vs ERB/Stimulus).
- **Spec inventory and atomic commits** (below): planned playbook-builder runs,
  commit sequencing for Path C, buildable-commit expectations, and parity with
  Path A Step 6 / Step 8 checkpoints.

When updating behavior, align **SKILL.md** Path C with this file so they do not
drift. Prefer expanding detail here and keeping **SKILL.md** as a concise summary.

---

## When to Use This

Use this flow when the user says or implies any of these:

- **Add to existing:** "add this to an existing page", "insert this banner",
  "work this into the current screen", "new element on an existing page".
- **Edit existing:** "change this feature", "update the existing component",
  "replace this section", "make the built page match this design".
- **Feature continuation:** "add to the feature we already made", "extend the
  payment methods flow", "new step/state/dialog for this feature".
- **Interaction/workflow:** "when they click", "show a modal", "loading/error
  states", "multi-step", "tab behavior", "save/confirm/cancel".
- **Scoped full-page handoff:** the Figma URL shows a whole page, but the user
  says only part is new or changed.

Do not use this flow when the user wants a brand-new isolated page/component
with no existing nitro target. Use `setup-component.md` and Path B instead.

If the user explicitly asks to rebuild the whole page from Figma, use the main
Path A flow and warn that existing wiring may be replaced unless the work is
scoped.

---

## Core Rule

For extend/edit work, there are two authorities:

1. **playbook-builder spec:** visual structure, Playbook components, props,
   spacing tokens, copy, and layout intent.
2. **Existing nitro-web code:** file boundaries, export names, data flow,
   props, callbacks, framework split, and pack conventions.

Match the design without copying Figma's layer tree into the repo. Preserve the
current code structure unless the brief explicitly asks for a replacement.

---

## Where work happens (nitro-web)

All implementation work targets the **nitro-web** repository (or whatever repo
hosts the Nitro UI). The playbook-builder repo ships the `@powerhome/playbook-builder`
package and these skills.

Typical locations:

- **Component packs:** `components/<pack_name>/` with UI under paths such as
  `app/javascript/` (React) and/or `app/views/` (Rails).
- **React:** Page and feature components, pack entrypoints, barrel exports. Path
  A in **SKILL.md** describes read-only checks for entrypoints.
- **Rails ERB:** Views/partials using `pb_rails`, controllers that render the
  page, routes.

**Detect framework** using Path A rules in **SKILL.md** (React signals vs
`Playbook::PbKitHelper` / ERB). Follow [react-build-rules.md](./react-build-rules.md)
or [erb-build-rules.md](./erb-build-rules.md) for the stack you edit.

---

## Type Values

Use one of these labels in handoffs. If the request is hybrid, choose the
closest label and clarify in prose.

- `add_page_section` - new block on an existing page
- `add_inside_feature` - new UI inside an already-built feature area
- `edit_page_section` - change an existing slice of a page
- `edit_feature` - change UI that shipped as a cohesive feature
- `interaction_only` - mostly behavior/state; visual may be unchanged

---

## Spec inventory and atomic commits

Use this so a human can open a branch or PR and follow **small, ordered
commits** instead of one giant diff.

### Before you write code

1. **List spec sources.** For each UI slice that comes from Figma, record the
   planned `playbook-builder` run: **URL + `node-id`**. If you will skip the spec fetch,
   write why (for example "Title size tweak only in existing TSX", or
   `interaction_only` with no new nodes from Figma).
2. **Never commit spec JSON** as part of the implementation branch (keep it
   local/ephemeral or omit from commits). Same rule as Path A in **SKILL.md**.
3. **Order work** so each step is reviewable: subtree implementation first, then
   parent wiring, then format/lint, then audit fixes if large.

### Commit sequence examples (Path C)

| Step | What to commit | Example message |
|------|----------------|-------------------|
| 1 | New or replaced section/component files from the delta spec | `feat: add PastDueBanner section for billing settings` |
| 2 | Parent page/feature imports composition only | `feat: wire PastDueBanner into BillingSettingsPage` |
| 3 | Format/lint only | `style: format billing settings components` |
| 4 | Audit gap fixes only (optional if noisy) | `fix: address playbook audit gaps for PastDueBanner` |
| 5 | Mock-data fixtures only (when split from section UI commits) | `chore: add mock billing fixtures from spec text` |

Path A greenfield builds already use commit checkpoints in **SKILL.md** Path A
Step 6 (after each section file) and Step 8 (after format/lint). Mirror that
spirit here: **one logical concern per commit**.

### Minimal diff

- Implement only what the scoped spec and integration glue require (see **Path C
  translation rules vs Path A Step 6** later in this document).
- Do not mix drive-by refactors, unrelated file churn, or cosmetic renames with
  feature commits.

### Buildable commits

- Prefer every commit to satisfy the repo's usual lint/typecheck expectations.
- If an intermediate step cannot compile or pass CI, **combine** those edits into
  one commit or fix-forward in the same commit **unless** the user explicitly
  wants WIP checkpoints.

### If git write is not allowed

Output a numbered **proposed commit plan**: files per step and suggested
messages so the developer can run `git add` / `git commit` locally.

### Squash merge note

Some teams squash-merge PRs; atomic commits still help **during** review on the
feature branch even if merge collapses history.

---

## Agent Workflow

1. **Classify the request** using the type values above.
2. **Find the target in nitro-web** from the user's app page, URL, menu path,
   component pack, entry file, feature name, or visible copy.
3. **Read first:** inspect the target page/feature files and one or two similar
   sections in the same pack for naming, file size, props, callbacks, and
   composition style.
4. **Scope the Figma input:** run `playbook-builder` only on the small Figma
   node for the new or changed UI. Do not run codegen on the full page unless
   the user explicitly asked for a full rebuild.
5. **Reconcile spec to code:** map Figma sections to existing `*Section`,
   `*Panel`, or partial files when possible. Extend or replace the specific
   subtree; do not invent new top-level structure that conflicts with the pack.
6. **Preserve wiring:** keep existing props, types, callbacks, routes, Turbo
   frames, and controller boundaries unless the brief asks to change them.
7. **Apply normal figma-build standards:** Playbook only, no raw styling, files
   under 200 lines where possible, framework reference rules, lint/format, and
   post-build audits (scope audits to files and spec-backed subtrees you
   touched; see **First-time agent checklist**).

Optional developer instruction:

```markdown
Match file layout to the existing `components/<pack>/...` sections; do not
mirror Figma layer names.
```

---

## Spec fetch and MCP mini-loop (mandatory when playbook-builder runs)

Invoke playbook-builder however your environment supports it (**`npx`**, installed binary, or **plugin / marketplace** wrapper such as nitro-web or plugin-config). The contract is the same: valid PageSpec JSON for the Figma `node-id`.

For Path C you usually fetch a **delta** spec (small `node-id`). The same Path A
pipeline applies; only the scope of visual review shrinks.

When you run `playbook-builder` for that delta:

1. **Token** — Follow Path A Step 2 in **SKILL.md**. No token means stop and tell
   the user how to fix it.
2. **Spec fetch** — Follow Path A Step 3: successful JSON (stdout or tool output), diagnose failures
   with Path A’s table. Do not commit the spec JSON.
3. **MCP cross-validation** — Follow Path A Step 3b on the **delta node**:
   screenshot of the delta, `get_design_context` on major sub-nodes (header,
   main block, footer area of the delta as relevant). Record a **gap list** when
   MCP shows components the spec missed (Avatar, Icon, etc.).

Skip steps 1–3 only when you are **not** running playbook-builder (for example a tiny
in-file prop tweak with no new spec, or purely verbal edits).

Then continue with Path A Steps 4–6 logic for **implementing** the delta subtree,
plus Path C reconciliation into existing parents.

---

## Path C translation rules vs Path A Step 6

Path A Step 6 requires strict fidelity to the spec for what the spec defines.

- **Inside the delta subtree:** Keep Path A rules — every emitted spec prop,
  nesting, and spec text must be reflected in code for that subtree.
- **Outside the delta / integration glue:** You may add **minimal** props,
  types, ids, or handlers needed to connect new UI to **existing** parents
  (callbacks already on the page, `pickerId` for `DatePicker`, props threaded from
  existing containers). Do not invent extras that are not required for
  integration or Playbook correctness.

If the user request only makes sense with new server behavior, stub UI and flag
backend follow-up rather than inventing APIs.

---

## React vs ERB/Stimulus (interactions)

Path C applies to **both** stacks. Use the right toolkit:

| Concern | React (TSX) | Rails ERB |
|---------|-------------|-----------|
| Local UI state | `useState`, conditional render | Stimulus controller classes, toggles, targets |
| Dialogs / overlays | Playbook `Dialog` with React state | Playbook `Dialog` via `pb_rails`, Stimulus for open/close if needed |
| Tabs / collapse | Playbook `Nav`, `Collapse` | Same components via `pb_rails`; watch ERB child block rules |
| Forms | Controlled inputs, typed handlers | `form_with`, Stimulus per [erb-build-rules.md](./erb-build-rules.md) |

Always use Playbook components and tokens; never add styling-only `className` or
raw pixel styling. When unsure, read the framework rule file for your stack.

---

## First-time agent checklist

Use this when you are new to nitro-web or Path C.

1. Confirm **Path C** applies (incremental change to existing UI). If net-new
   pack with no anchor, consider Path B first.
2. Gather **target anchors:** menu path, URL, feature name, component pack, or
   file path — ask for one if missing.
3. Open **existing** page/feature files and one similar section in the same pack.
4. If using Figma for new/changed UI: obtain a **delta** `node-id` (not the whole
   page unless explicitly rebuilding).
5. Run **playbook-builder** on the delta; run **spec fetch + MCP mini-loop** above.
6. Implement the delta subtree with **spec fidelity**; add **glue** only as in
   **Path C translation rules vs Path A Step 6**.
7. Wire the subtree into the **smallest** correct parent; do not regenerate
   unrelated sections.
8. Run **format/lint** per the framework rule file.
9. Run Path A **Step 9** audits **scoped** to changed files and spec-backed
   subtrees (Phase 1 prop audit for those subtrees; MCP/visual checks on the
   delta).
10. Hand off: note TODOs for backend/Turbo if out of scope.

---

## Question Policy

Ask for one clarifying anchor before coding when:

- You cannot identify where in nitro-web the change belongs from page, URL,
  menu path, feature name, or visible copy.
- The Figma link points to a full page but the request is scoped. Ask for a
  child `node-id` or confirm that higher manual risk is acceptable.
- The request includes interactions but not persistence. Ask whether behavior
  is local UI only, reuses an existing API/callback, or is backend follow-up.
- Code structure and Figma structure conflict in a way that would require
  replacing existing data flow or callbacks.

---

## Interactions and Workflow

Designs often include tabs, dialogs, expand/collapse, multi-step flows, and
loading/error/empty states. `playbook-builder` does not emit server contracts.

Usually in scope with figma-build:

- React `useState`, conditional rendering, and typed local UI state
- Playbook `Dialog`, `Nav`, `Collapse`, `FixedConfirmationToast`, buttons, and
  disabled/loading states
- Wiring controls to existing props, callbacks, or named handlers already on
  the page
- Stub handlers when the brief labels persistence as backend follow-up

Usually out of scope unless the ticket explicitly asks:

- New Rails endpoints, GraphQL operations, model queries, Sidekiq work, or
  authorization rules
- New Turbo stream contracts or complex persistence workflows
- Inventing server APIs from a Figma prototype

If backend behavior is unclear, do not invent contracts. Stub the UI or connect
to a named existing callback/API, then flag the backend follow-up clearly.

---

## Edge Cases

| Edge case | Agent response |
|-----------|----------------|
| Multiple new Figma frames | Ask whether they are alternatives, responsive states, or workflow steps |
| Screenshot only, no `node-id` | Use screenshot for orientation; ask for a Figma selection link before codegen unless it is a tiny direct edit |
| Existing code diverges from old Figma | Existing code wins for data flow and file organization; new spec wins only for the scoped visual target |
| "Make it match Figma" with whole-page link | Ask what changed or require explicit full-page rebuild approval |
| Interaction needs backend behavior | Stub UI or wire to named existing callback/API; do not invent Rails routes or contracts |
| Dirty or modified files | Read current contents and work with existing changes; do not revert unrelated work |
| Responsive variants unclear | Ask whether desktop-only is acceptable or request variant frames |
| Accessibility not shown in Figma | Preserve existing labels/semantics; add accessible names for new controls from visible text |

---

## Prompt Templates

### Template A: Designer / PM

```markdown
## Nitro UI change (extend existing page)

**Type:** add_page_section | add_inside_feature | edit_page_section | edit_feature | interaction_only

**Where in the app:** (pick one or more)
- Page / screen name:
- Menu path: e.g. Settings -> Billing
- URL (if you have it):

**Figma**
- Link (with `node-id` if possible; use "copy link to selection" on the small frame that is only the new or changed UI):
- If you only have the full page in Figma, say so.

**What should happen**
- In one or two sentences, what is new or changed?
- What must not be redesigned?

**If editing or extending a feature** (optional)
- Feature name (what users call it):
- Known component / area name in code:

**If behavior / interactions matter** (optional)
- What should happen when the user clicks, changes tabs, opens a dialog, etc.:
- Should anything save to the server? yes / no / unsure

**Notes:** screenshot, ticket, or Slack thread
```

### Template B: Developer

```markdown
## Nitro UI change (extend existing page)

**Type:** add_page_section | add_inside_feature | edit_page_section | edit_feature | interaction_only

**Repo / pack:** e.g. `components/billing/`
**Entry file:** path to main TSX or ERB if known
**Route / controller:** optional

**Figma (delta)** - `node-id` should point at only the new/changed frame:
- URL:

**Placement**
- insert | replace
- After / instead of: or "infer from Figma order + screenshot"

**Scope - leave untouched:**

**Backend / data:** static | existing props | needs API

**Feature anchor** (for add_inside_feature | edit_feature)
- Feature root file or folder:
- Replace entire subtree vs patch:

**Interactions / wiring**
- Existing callbacks / props to reuse:
- New server work needed: yes / no - describe or "backend follow-up ticket"
```

### Template C: Tiny Edit

```markdown
## Nitro UI tweak

**Page:** Billing settings
**File (if known):** `.../BillingSettingsPage.tsx`
**Change:** Title should be size 2, not 3, per design.
**Ref:** screenshot / Figma node
```

### Template D: Interaction / Workflow

```markdown
## Nitro UI - interactions and workflow

**Links to:** paste Template A or B above, or provide minimal context below

**Page / feature:**
**Type:** interaction_only | add_inside_feature | edit_feature

**User-visible states:** default, loading, error, empty, success toast

**Triggers and outcomes:**
- Action -> Result

**Data / persistence:**
- Stays in React state only | Must call API | Unsure

**Existing wiring to reuse:** endpoints, props, callbacks, Turbo frame names

**Backend / platform follow-up:** explicit none | describe

**Figma:** prototype link or extra frames for error/loading if any
```

---

## Examples

Designer example:

```markdown
## Nitro UI change (extend existing page)

**Type:** add_inside_feature

**Where in the app:**
- Page: Billing settings
- Feature name: Payment methods list

**Figma**
- https://www.figma.com/design/abc123/File?node-id=999-111
  Frame: "Add - Make default" row actions

**What should happen**
- Add "Make default" on each card; clicking opens a confirmation dialog.
- Do not redesign the whole billing page.

**If behavior / interactions matter**
- Click -> dialog -> confirm updates which card is default visually.
- Loading state appears on the confirm button.
```

Developer example:

```markdown
## Nitro UI change (extend existing page)

**Type:** edit_feature

**Repo / pack:** `components/billing/`
**Feature anchor:** `components/billing/app/javascript/components/PaymentMethodsSection.tsx`

**Figma (delta)**
- https://www.figma.com/design/abc123/File?node-id=555-666

**Placement**
- replace - subtree for `PaymentMethodsSection` only

**Scope - leave untouched:** rest of `BillingSettingsPage`

**Backend / data:** existing props; card list still from parent

**Interactions / wiring**
- Preserve existing `onSelect` / `onRemove` callbacks.
- Add loading prop only if shown in Figma or already available from parent.
```

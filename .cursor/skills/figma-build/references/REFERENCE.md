# Figma Build — Reference

Shared lookup tables for both React and ERB builds. For framework-specific patterns, see [react-build-rules.md](./react-build-rules.md) or [erb-build-rules.md](./erb-build-rules.md). For playbook-builder processor behavior, MCP guidance, and component recognition patterns, see [component-intelligence.md](./component-intelligence.md).

---

## Spec field reference

| Field | Description |
|-------|-------------|
| `component` | Playbook component name |
| `props` | Ready-to-use Playbook props — copy 1:1 |
| `props.flex` | `"1"` = grows along parent axis |
| `props.width` | `"100%"` = fills parent width |
| `props.padding` | `"none"` overrides Playbook defaults |
| `props.background` | Playbook token or `rgba(...)` (use `htmlOptions` for RGBA) |
| `props.borderRadius` | Playbook token; non-uniform corners → `htmlOptions.style.borderRadius` |
| `props.maxWidth` | Playbook token (`"xs"`–`"xl"`); add `margin="auto"` when present |
| `props.textTransform` | `"none"` on Pill/Badge |
| `props.textAlign` | Apply ONLY on text components. On containers: **skip** (see framework rules) |
| `props.tag` | `"span"` for inline rendering |
| `props.rows` | Textarea visible rows |
| `props.color` | Text color token — always explicit including `"default"` |
| `props.height` | `"100%"` for cross-axis stretch |
| `props.variant` | Playbook variant |
| `htmlOptions` | Top-level escape-hatch (NOT inside props in spec) |
| `text` | Display content from Figma |
| `children` | Nested child nodes |
| `dimensions` | `{ width, height, sizingH, sizingV }` — emitted on all layout containers. Use for flex ratios (FIXED siblings), maxWidth detection (FILL containers with large widths), and layout verification |
| `figmaName` | Layer name (context only) |

---

## Spec-to-Playbook component mapping

| Spec `component` | Playbook | Key props |
|-------------------|----------|-----------|
| `Flex` | `Flex` | orientation, gap, padding, align, justify, flex, width, height, background, maxWidth |
| `Card` | `Card` | padding, gap, flex, width, height, borderRadius |
| `Title` | `Title` | size (3=page, 4=section), bold, color |
| `Body` | `Body` | color |
| `Caption` | `Caption` | color, size |
| `Detail` | `Detail` | bold, color |
| `Button` | `Button` | text, variant, size |
| `Avatar` | `Avatar` | name |
| `Badge` | `Badge` | text, variant, textTransform |
| `Pill` | `Pill` | text, variant, textTransform |
| `Timestamp` | `Timestamp` | timestamp, variant |
| `TextInput` | `TextInput` | label, required, requiredIndicator, placeholder |
| `Select` | `Select` | label, options — **never `<option>` children** |
| `Textarea` | `Textarea` | label, required, placeholder, rows |
| `SelectableCard` | `SelectableCard` | checked, name, value, onChange |
| `FormGroup` | `FormGroup` | fullWidth |
| `SectionSeparator` | `SectionSeparator` | — |
| `Table` | `Table` | container, size; sub-components: Head, Row, Header, Cell |
| `Nav` | `Nav` + `NavItem` (ERB: `nav` + `nav/item`) | variant, orientation, highlight |
| `BreadCrumbs` | `BreadCrumbs` + `BreadCrumbItem` | paddingBottom |

---

## Troubleshooting — CI / Jenkins

| Symptom | Cause | Fix |
|---------|-------|-----|
| `bin/rubocop: not found` | Missing binstubs | `bundle binstubs rake rubocop yard rspec-core` |
| `bin/yard: not found` | Missing binstubs | Same as above |
| Bundler can't find gem | Missing dev deps in gemspec | Add `add_development_dependency` entries |
| `nitro_linting` not found | Wrong Gemfile format | Use `gemspec` + `path ".."` pattern |

## Troubleshooting — General

| Symptom | Cause | Fix |
|---------|-------|-----|
| 404 | Engine not mounted | Add to `config/routes.rb` |
| App won't boot | `bundle install` not run | Run from repo root |
| Milano stale | Changes not pushed | Commit + push |
| Extra padding | Nitro shell padding | Add CSS override ([SKILL.md](../SKILL.md) Step 7) |
| `playbook-builder` fails | `FIGMA_TOKEN` not set | See [SKILL.md](../SKILL.md) Step 2 |
| CI `yarn lint` fails on Prettier | Prettier not run | Run `npx prettier --write` first |
| `(item) =>` rewritten to `item =>` | `.prettierrc` `arrowParens: "avoid"` | Use `item =>` for single params |
| CI `erb_lint` fails on trailing commas | RuboCop rule | Add trailing commas to multiline hashes |
| CI `eslint` fails on prop order | `react/jsx-sort-props` | Write all JSX props in A-Z order |
| CI `eslint` fails on multi-comp | `react/no-multi-comp` | One React component per `.tsx` file |

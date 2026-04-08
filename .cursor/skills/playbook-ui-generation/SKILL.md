---
name: playbook-ui-generation
description: >-
  Generate UI code using Playbook design system components with validated props.
  Use when creating React/Rails UI, processing Figma handoffs, building forms,
  cards, dialogs, tables, or any user interface. Reads structured metadata from
  playbook-ui package to ensure correct component usage.
---

# Playbook UI Generation

Generate UI using Playbook components with validated props.

## Required: Read These Files First

Before generating ANY Playbook code, you MUST read:

1. **Component index** — `node_modules/playbook-ui/dist/ai/index.json`
2. **Global props** — `node_modules/playbook-ui/dist/ai/global-props.schema.json`
3. **Component schemas** — `node_modules/playbook-ui/dist/ai/kits/<component>.schema.json` for each component you'll use

For bulk lookup, read `node_modules/playbook-ui/dist/ai/all-schemas.json` (contains all component schemas in one file).

## AI Metadata Location

```
node_modules/playbook-ui/dist/ai/
├── index.json               # Component manifest (list of all kits with schema paths)
├── global-props.schema.json # Props available on ALL components
├── all-schemas.json         # All component schemas bundled (use for bulk lookup)
└── kits/                    # Per-component schemas
    ├── button.schema.json
    ├── card.schema.json
    ├── flex.schema.json
    └── ...
```

## Generation Workflow

### Step 1: Detect Platform

Determine syntax from target file extension:

| Extension | Platform | Syntax |
|-----------|----------|--------|
| `.tsx`, `.jsx` | React | `import { Button } from "playbook-ui"` then `<Button />` |
| `.erb` | Rails | `<%= pb_rails("button", props: {...}) %>` |

### Step 2: Discover Components

Read `index.json` to find available components. The `schemas.kits` object maps component names to their schema files.

### Step 3: Validate Props

For each component you'll use, read its schema from `kits/<name>.schema.json`:
- Prop names MUST exist in the schema
- Prop values MUST match allowed enum values
- Required props MUST be included
- Check platform-specific prop differences

### Step 4: Generate Code

**React:**
```tsx
import { Button, Card, Flex } from "playbook-ui"

<Card padding="md">
  <Flex justify="between" align="center">
    <Button variant="primary" text="Save" />
  </Flex>
</Card>
```

**Rails:**
```erb
<%= pb_rails("card", props: { padding: "md" }) do %>
  <%= pb_rails("flex", props: { justify: "between", align: "center" }) do %>
    <%= pb_rails("button", props: { variant: "primary", text: "Save" }) %>
  <% end %>
<% end %>
```

## Global Props

ALL Playbook components accept global props for spacing, layout, and styling.

**You MUST read `global-props.schema.json` for:**
- Valid spacing token values and their pixel equivalents
- Breakpoint definitions for responsive props
- All available global props (margin, padding, flex, position, etc.)
- Which props support responsive syntax

**Responsive syntax** (for props marked `responsive: true`):
```tsx
<Card 
  padding={{ default: "sm", md: "lg", xl: "xl" }}
  display={{ default: "block", md: "flex" }}
/>
```

## Platform-Specific Rules

### React-only components
Some components only exist in React (e.g., Lightbox, some charts). Check the schema's `platforms` field.

### Rails-only components
Some components only exist in Rails (e.g., Form with Rails form helpers). Check the schema's `platforms` field.

### Prop name differences
Some props have platform-specific names:
- React `htmlType="submit"` → Rails `type: "submit"`
- Check schema for `reactEquivalent` / `railsEquivalent` mappings

## Figma/Screenshot Workflow

When given a design screenshot or Figma file:

1. **Identify visual elements** — buttons, cards, layout containers, typography
2. **Map to Playbook components** — read `index.json` to find matching kits
3. **Extract props from visuals:**
   - Rounded corners → check component's `borderRadius` prop
   - Spacing → map pixels to tokens (16px → `md`)
   - Colors → use semantic color props (`variant`, `status`, `color`)
4. **Read component schemas** — validate all props before generating
5. **Generate code** — in the correct platform syntax

**Pixel-to-token mapping:** See `spacing.tokens` in `global-props.schema.json` for exact values.

## Validation Checklist

Before outputting code, verify:

| Check | How |
|-------|-----|
| Component exists | Look up in `index.json` |
| Prop name valid | Check schema's `properties` object |
| Prop value valid | Match against `enum` array in schema |
| Required props included | Check `required` array in schema |
| Platform supported | Check `platforms` field matches target file |

**Common mistakes to avoid:**

```
✗ variant="blue"   → use semantic names like "primary", "secondary"
✗ size="large"     → use abbreviated tokens: "lg"
✗ padding="16px"   → use tokens: "md"
✗ onClick in .erb  → Rails uses data attributes, not JS handlers
```

When a prop value is invalid, suggest the closest valid alternative from the schema's enum values.

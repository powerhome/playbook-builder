# Setup Component

Create a new Nitro engine component from scratch. Use when no existing component in `components/` is suitable for the Figma build.

**This skill does not generate component infrastructure.** The developer runs nitro-web's own generator, which creates all the scaffolding correctly. The skill only generates view-layer files (Step A).

## Step 1: Ask the user to run the generator

Tell the user:

> "No existing component matches this design. Please run the nitro-web component generator to create one:
>
> ```bash
> generators/component.sh engine <component_name>
> ```
>
> The generator is interactive — it asks about requirements (database, auth, theme, views, controllers, React). Once it finishes, let me know and I'll build the UI into it."

**Do NOT run the generator yourself.** The developer chooses the options.

## What the generator creates

For reference, the generator produces:

| Category | Files |
|----------|-------|
| Ruby infrastructure | Gemfile, gemspec, `.rubocop.yml`, Rakefile, binstubs |
| Rails | Engine, routes, controllers, ApplicationController |
| CI | spec/dummy, rspec config, dev dependencies |
| React (if selected) | package.json (but NOT tsconfig, entrypoints, or barrel exports) |

The developer may need to customize after generation (e.g., adding `helper Playbook::PbKitHelper` or `helper NitroReact::ViewHelpers` to ApplicationController, umbrella Gemfile/routes wiring).

## Step 2: Return to the build

After the generator is done and the user confirms, return to [SKILL.md](../SKILL.md) Path A Step 1 to build the design into the new component.

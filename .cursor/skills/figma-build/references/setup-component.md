# Setup Component

Create a new Nitro engine component from scratch. Use when no existing component in `components/` is suitable for the Figma build.

## Step 1: Run the generator

```bash
generators/component.sh engine <component_name>
```

The generator is interactive — it asks about requirements (database, auth, theme, views, controllers, React). Answer based on what the feature needs.

**The generator creates all infrastructure:** Gemfile, gemspec (with dev deps), `.rubocop.yml`, binstubs, spec/dummy, Rakefile, routes, controllers, etc.

**If the generator can't run** (e.g., component directory already exists from a failed attempt), delete the directory first: `rm -rf components/<name>`

## Step 2: Customize generated files

After the generator runs, customize for Nitro integration (the generator does NOT do this automatically):

**ApplicationController** — replace contents:

React:
```ruby
helper NitroReact::ViewHelpers  # add this line
```

Rails ERB:
```ruby
helper Playbook::PbKitHelper  # add this line
```

**React-specific files** (create manually — generator doesn't make these):
- `tsconfig.json` extending root
- `app/index.tsx` exporting React app
- `app/startup/<AppName>/index.tsx`
- `app/javascript/entrypoints/<component>/index.ts` (Vite entrypoint)

**Umbrella wiring:**
- Add `gem "<component>"` to root `Gemfile`
- Add `mount <Component>::Engine, at: "/<component>"` to `config/routes.rb`

## Step 3: Continue with your task

After setup, return to [SKILL.md](../SKILL.md) Path A Step 1 to build the design.

## Key file checklists

### React component

| File | Purpose |
|------|---------|
| `tsconfig.json` | Extends root — **Vite build fails without this** |
| `package.json` | `@powerhome/nitro_react` dependency |
| `app/index.tsx` | Exports React app |
| `app/javascript/entrypoints/<component>/index.ts` | Vite entrypoint |

**`tsconfig.json` template:**
```json
{
  "extends": "../../tsconfig.json",
  "include": ["./**/*.ts", "./**/*.tsx", "../../types.d.ts"]
}
```

### CI infrastructure (created by generator)

These must exist or Jenkins CI fails:

| File | Created by |
|------|-----------|
| `Gemfile` (with `gemspec` + `path ".."`) | Generator |
| `.rubocop.yml` | Generator |
| `bin/rubocop`, `bin/yard`, `bin/yardoc`, `bin/yri`, `bin/rspec`, `bin/rake` | `bundle binstubs` |
| Gemspec `add_development_dependency` entries | Generator |

If any are missing, run `bundle binstubs rake rubocop yard rspec-core` from the component directory.

### Templates

**Component Gemfile:**
```ruby
source "https://rubygems.org"

gemspec

path ".." do
  gem "nitro_auth", require: nil
  gem "nitro_linting", require: nil
  gem "nitro_ruby", require: nil
  gem "nitro_theme", require: nil
  gem "ruby_test_helpers", require: nil
end
```

**`.rubocop.yml`:**
```yaml
inherit_gem:
  nitro_linting: .rubocop_standard.yml

Style/FrozenStringLiteralComment:
  EnforcedStyle: never
```

**Gemspec dev dependencies:**
```ruby
s.add_development_dependency "dep_shield", "0.3.1"
s.add_development_dependency "nitro_linting", "0.0.1"
s.add_development_dependency "nitro_ruby", "0.0.1"
s.add_development_dependency "parser", ">= 2.5", "!= 2.5.1.1"
s.add_development_dependency "pry", "0.14.2"
s.add_development_dependency "pry-byebug", "3.10.1"
s.add_development_dependency "rainbow", "2.2.2"
s.add_development_dependency "ruby_test_helpers", "0.0.1"
s.add_development_dependency "yard", "0.9.37"
```

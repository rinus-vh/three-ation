# Project Skill — Vite Prototype Template

This file is the source of truth for any AI agent (Claude Code or otherwise) working
in this repository. Read it fully before making changes.

**Also read `.claude/SKILL_DESIGN_SYSTEM.md` before writing any UI code.**

---

## Package manager: pnpm (strictly enforced)

**Always use `pnpm`. Never use `npm` or `yarn`.**

```bash
pnpm install          # install deps
pnpm add <pkg>        # add a dependency
pnpm add -D <pkg>     # add a dev dependency
pnpm remove <pkg>     # remove a dependency
pnpm start            # start dev server
pnpm build            # production build
pnpm preview          # preview build locally
pnpm lint             # run ESLint (0 warnings allowed)
pnpm lint:fix         # auto-fix lint issues
pnpm lint:css         # run Stylelint (0 warnings allowed)
pnpm lint:css:fix     # auto-fix CSS lint issues
```

The `package.json` sets `"packageManager": "pnpm@9.x.x"` and `.npmrc` sets
`engine-strict=true`. Running `npm install` will throw an error on purpose.

---

## Shared `@6njp` sources & how this project consumes them

This project depends on three shared `@6njp` packages, all authored by `rinus-vh`
and all consumable either from a **local checkout** (`file:`) for local development
or from their **canonical GitHub repo** (`github:`) for CI / sharing:

| Package | Kind | Local path | GitHub ref |
|---|---|---|---|
| `@6njp/eslint-plugin` | devDep (lint) | `file:/Volumes/Development/plugins/eslint-plugin` | `github:rinus-vh/plugins#path:eslint-plugin` |
| `@6njp/stylelint-plugin` | devDep (lint) | `file:/Volumes/Development/plugins/stylelint-plugin` | `github:rinus-vh/plugins#path:stylelint-plugin` |
| `@6njp/prototype-library` | dependency (UI) | `file:/Volumes/Development/prototype-library` | `github:rinus-vh/prototype-library` |

> The plugins live in one **monorepo** (`rinus-vh/plugins`), so each is addressed
> with a `#path:<subdir>` suffix. The component library is a **single package at
> the repo root**, so it needs no `#path:`.

### Why two modes

The whole point: **maintain the design system and lint rules in one place**, then
import them into every prototype. While *developing* those shared packages you point
at the local checkout (`file:`) so you can edit them on this machine. When
*committing or sharing* a prototype you want a portable, machine-independent ref
(`github:`) so anyone (and CI) resolves the same canonical source — no
`/Volumes/Development/...` paths leaking into a shared `package.json`.

> **`file:` is a COPY, not a live link.** pnpm copies the source into its store on
> install. After you edit a local package (library or plugin), re-run `pnpm install`
> in the consuming project to re-sync — it is **not** live/HMR.
> (We deliberately do **not** use `link:` for the component library: a symlink drags
> in the library's own nested `react`/`react-dom`, producing two React copies and an
> "Invalid hook call". `file:` resolves a single React from the prototype.)

### Switch scripts

Two ES-module scripts in `scripts/` flip **all three** packages at once, then remind
you to install:

```bash
pnpm sources:local    # → file: paths on this machine (live editing)
pnpm sources:remote   # → github: refs (commit / CI / share)
# (equivalent to: node scripts/use-local-sources.js  /  use-remote-sources.js)
```

`use-local-sources.js` rewrites the two lint plugins in `devDependencies` and the
library in `dependencies` to `file:` paths; `use-remote-sources.js` rewrites them to
`github:` refs. Always run `pnpm install` afterward (the `sources:*` npm scripts do
this for you).

**Rule of thumb:** develop on `file:`, commit on `github:`. Before committing a
prototype, run `pnpm sources:remote && pnpm install` so the lockfile/`package.json`
reference GitHub, not local paths.

> **Stylelint store-cache note:** `pnpm install` after switching to a local plugin
> may reuse a cached store copy. If a newly added rule isn't recognised, manually
> copy the new rule dir into
> `node_modules/@6njp/stylelint-plugin/stylelint-plugins/rules/` and update
> `…/stylelint-plugins/config.js` until the cache is invalidated (e.g. bump the
> plugin version).

---

## The component library: `@6njp/prototype-library`

All reusable UI lives **in the library, not in this repo**. This template is a thin
*consumer* — and the model every other prototype follows. Maintain a component once
in the library; every prototype picks it up.

### What's in it

- **Building blocks** (`@6njp/prototype-library`): `Button`, `ButtonLink`, `Checkbox`,
  `Dropdown`, `Grid` + `useGrid` + tiling constants, `Heading*`, `Icon`, `Knob`,
  `Label*`, `Link`, `LinkUnderline`, `Header`, `MenuItem`, `Modal`, `Panel`,
  `Paragraph*`, `RadioGroup`, `Slider`.
- **Machinery** (`@6njp/prototype-library/machinery`): `getThemeVariables`,
  `getThemeName`, `themes`, `themeLookupMap`, `toSafeHref`, `cx`.
- **Styles** (`@6njp/prototype-library/styles.css`): the element reset **and all
  design tokens** (`:root` custom properties — colors, sizes, radii, type scale,
  motion).

### How to use it

```jsx
import { Button, Panel, Grid, Modal } from '@6njp/prototype-library'
import { getThemeVariables } from '@6njp/prototype-library/machinery'
```

```js
// src/main.jsx — once, before this project's own index.css:
import '@6njp/prototype-library/styles.css'
import '@/index.css'
```

This project keeps only **app-level** code: `App.jsx`, `src/index.css` (body
typography + theme propagation), and `src/pages/**`. There is no local
`features/`, `machinery/`, or `cssGlobal/` anymore — import them from the library.

### Why raw source (not a prebuilt bundle), and how the build handles it

The library ships **uncompiled** `.jsx` + CSS Modules (like a workspace package).
No build/publish step for the library — but **this project's `vite.config.js` must
process the library exactly like its own `src/`**. That wiring is already in place
(and is inherited by every prototype that copies this template):

1. **`injectGlobals()` plugin** — prepends `import React` and a local `cx` const to
   every first-party **and library** `.js/.jsx` file. Components are authored without
   importing `React`/`cx`; this provides them.
   - `cx` is injected as a const **on purpose, not via Vite `define`**: `define` does
     not reach a dependency excluded from `optimizeDeps`, so it would work in
     `vite build` (Rollup applies it) yet throw `ReferenceError: cx` in `vite dev`.
     Injection runs the same in dev and build — no split.
2. **`react({ exclude: [/node_modules\/(?!@6njp\/prototype-library\/)/] })`** — runs
   the React/JSX transform on our src + the library, but skips all other deps.
3. **`optimizeDeps.exclude: ['@6njp/prototype-library']`** — keeps the library out of
   esbuild pre-bundling so the transforms above actually run against it.
4. **`resolve.dedupe: ['react', 'react-dom']`** + **`server.fs.allow: ['..']`** —
   defensive guards so a single React always wins and files just outside the root
   can still be served.

The single `isOurSource(id)` helper makes this work for both modes — `file:` resolves
under `node_modules/.pnpm/@6njp+prototype-library@file+…/…/@6njp/prototype-library/`,
`github:` lands in `node_modules/@6njp/prototype-library/` — while explicitly NOT
matching the library's own nested `node_modules/` (so React itself never gets the
inject).

### Editing a component

1. `pnpm sources:local && pnpm install` (if not already on local).
2. Edit the component in `/Volumes/Development/prototype-library/src/...`.
3. **Re-run `pnpm install` in the prototype to re-sync the `file:` copy** (it is not
   live/HMR), then start/refresh the dev server. Lint the library in its own dir
   (`pnpm lint` / `pnpm lint:css`).
4. When done: in the prototype, `pnpm sources:remote && pnpm install` before
   committing (and push the library repo separately).

> The library has **no `@` alias** (a published package can't), so its internal
> cross-component imports are relative (`../Icon/Icon.jsx`). Its own ESLint config
> disables `@6njp/no-relative-parent-import` for that reason. Do **not** introduce
> `@/` imports inside the library.

---

## Framework & language

| Concern       | Choice            |
|---------------|-------------------|
| Bundler       | Vite 8            |
| Framework     | React 19          |
| Language      | JavaScript (JSX)  |
| Node minimum  | 22.0.0 (LTS)      |

No TypeScript. Do not convert files to `.ts`/`.tsx` unless the user explicitly asks.

---

## CSS: CSS Modules (scoped styles)

Every component gets its own `ComponentName.module.css` file.

```
src/
  features/
    Button/
      Button.jsx
      Button.module.css   ← always co-locate the module
```

### Rules
- **Never use plain global CSS for component styles.** Use CSS Modules.
- **Global css variables only** go in `src/cssGlobal/XX.css`.
- **Global styles only** go in `src/index.css`.
- Class names in modules use **camelCase** (configured in `vite.config.js`).
- Generated class pattern: `[filename]__[local]--[hash:5]` — don't rely on the
  hash in tests; address by the camelCase local name.

```jsx
// ✅ correct
import styles from './Button.module.css'
<button className={styles.primaryButton}>…</button>

// ❌ wrong — plain class string
<button className="primaryButton">…</button>
```

### CSS custom properties
All design tokens live in `src/cssGlobal/global.css` under `:root`. Consume them in
modules via `var(--token-name)`. Do not hardcode colours, spacing, or radii.

---

## Path aliases

`@` resolves to `src/`. Use it for all non-relative imports:

```js
// ✅
import Button from '@/features/Button/Button.jsx'
import '@/cssGlobal/global.css'

// ❌ — fragile relative paths
import Button from '../../../features/Button/Button.jsx'
```

---

## Linting: ESLint 9 (flat config)

Config file: `eslint.config.js`

### Active plugins
| Plugin | Purpose |
|---|---|
| `@eslint/js` | JS recommended rules |
| `eslint-plugin-react` | React best practices |
| `eslint-plugin-react-hooks` | Hooks rules (exhaustive-deps etc.) |
| `eslint-plugin-react-refresh` | Vite HMR safety |
| `@6njp/eslint-plugin` | Custom project rules (linked from `/Volumes/Development/plugins/eslint-plugin`) |

### Key rules (non-negotiable)
| Rule | Level | Note |
|---|---|---|
| `prefer-const` | error | Never use `let` when the binding never changes |
| `no-var` | error | Always `const`/`let` |
| `eqeqeq` | error | `===` only |
| `no-unused-vars` | warn | Prefix with `_` to suppress intentionally |
| `no-console` | warn | Only `console.warn` and `console.error` allowed |
| `react/prop-types` | warn | Document your props |
| `react/self-closing-comp` | warn | `<Foo />` not `<Foo></Foo>` |

`pnpm lint` runs with `--max-warnings 0`. **CI will fail on warnings**, not just errors.

### Suppressing a rule (use sparingly)
```js
// eslint-disable-next-line no-unused-vars -- intentional: exported for external use
export const _internal = …
```

---

## Custom ESLint plugin

**Package:** `@6njp/eslint-plugin`
**Source:** `/Volumes/Development/plugins/eslint-plugin`
**Linked via:** `pnpm add -D file:/Volumes/Development/plugins/eslint-plugin`

### Active `@6njp` rules
| Rule | Level | Purpose |
|---|---|---|
| `@6njp/component-properties` | warn | Enforce component prop conventions |
| `@6njp/import-sort` | warn | Enforce import group order with blank-line separation |
| `@6njp/jsx-key` | warn | Require `key` prop in lists/iterators |
| `@6njp/layout-class-name` | warn | Enforce layout-via-parent CSS Module pattern |
| `@6njp/naming-policy` | warn | Enforce component and file naming conventions |
| `@6njp/no-default-export` | warn | Prefer named exports (App.jsx is exempt) |
| `@6njp/no-double-spaces` | warn | No double spaces in JSX/JS |
| `@6njp/no-relative-parent-import` | warn | Use `@/` alias instead of `../` parent imports |
| `@6njp/required-props` | warn | Enforce required prop presence |
| `@6njp/return-whitespace` | warn | Blank line before return statements |

---

## Linting: Stylelint 17

Config file: `stylelint.config.cjs`
Command: `pnpm lint:css` / `pnpm lint:css:fix`

### Plugin
**Package:** `@6njp/stylelint-plugin`
**Source:** `/Volumes/Development/plugins/stylelint-plugin`
**Linked via:** `pnpm add -D file:/Volumes/Development/plugins/stylelint-plugin`

### Active `custom/` rules
| Rule | Purpose |
|---|---|
| `custom/css-global` | Only `:root`, `@value`, `@custom-media`, `@custom-selector` in `cssGlobal/` |
| `custom/layout-related-properties` | Layout props only in nested selectors; intrinsic sizes need `!important` |
| `custom/naming-policy` | CSS class naming conventions |
| `custom/selector-policy` | No tag selectors outside `reset.css` / `index.css` |
| `custom/parent-child-policy` | Layout via parent-nested class rules |
| `custom/root-policy` | Root selector constraints |
| `custom/at-rule-restrictions` | Restrict which at-rules are allowed |
| `custom/color-schemes` | Color token usage |
| `custom/index` | Index file conventions |
| `custom/reset` | Only tag selectors allowed in `reset.css` |
| `custom/declaration-group-separator` | Require an empty line between CSS custom properties (`--*`) and regular properties |

### CSS file structure (required by the plugin)
```
src/
  reset.css              ← tag selector resets ONLY (html, body, *, img…)
  cssGlobal/
    global.css           ← :root custom properties ONLY
  features/
    Component/
      Component.module.css
```

- `reset.css` must be named exactly `reset.css` and NOT inside `cssGlobal/`
- `global.css` inside `cssGlobal/` may only contain `:root`, `@value`, `@custom-media`, `@custom-selector`, `:export`
- Intrinsic size props (`min-height`, `max-width`, etc.) in root CSS rules require `!important`

### Suppressing a rule (use sparingly)
```css
/* stylelint-disable-next-line custom/layout-related-properties */
.exception { min-height: 200px; }
```

---

## File & folder conventions

This is a **thin consumer** of `@6njp/prototype-library`. Reusable building blocks,
machinery, and design tokens live in the **library repo**, not here:

```
src/
  assets/          # static assets (images, fonts, icons)
  pages/           # app/prototype-specific pages
    PageName/
      PageName.jsx
      PageName.module.css
  App.jsx          # app shell — composes library components
  App.module.css
  index.css        # app-level base styles (body type, theme propagation to :root)
  main.jsx         # entry — imports '@6njp/prototype-library/styles.css' first
```

- **No local `features/`, `machinery/`, or `cssGlobal/`** — those are the library's
  job. Import building blocks from `@6njp/prototype-library`, machinery from
  `@6njp/prototype-library/machinery`, tokens+reset via its `styles.css`.
- New *reusable* component or token → add it **in the library** (see the library
  section above), not here. Only genuinely app-specific UI belongs under `src/pages/`.
- Page/component folders use **PascalCase**; files match the folder name.
- One component per file.
- No barrel `index.js` files unless a folder grows to 3+ files.

> The library mirrors these same conventions internally, with one exception: it has
> no `@` alias, so its internal imports are relative. See the library section.

---

## Icon component rule

**Always use `<Icon />` from `@6njp/prototype-library` for lucide icons. Never render them directly.**

```jsx
// ✅ correct
import { Icon } from '@6njp/prototype-library'
import { AlertCircle } from 'lucide-react'
<Icon icon={AlertCircle} layoutClassName={styles.iconLayout} />

// ❌ wrong — direct lucide render
import { AlertCircle } from 'lucide-react'
<AlertCircle size={14} />
```

Apply `layoutClassName` with a class nested inside the parent's CSS rule (per CSS layout conventions in CLAUDE.md).

---

## What NOT to do

- ❌ `npm install` / `yarn add` — use `pnpm`
- ❌ Inline styles (`style={{ color: 'red' }}`) for anything beyond truly dynamic values
- ❌ Global CSS for component-scoped styles
- ❌ Hardcoded colour/spacing values — use CSS custom properties
- ❌ Default exports for anything other than components and pages
- ❌ `.ts`/`.tsx` files (this is a JS project)
- ❌ Committing with lint warnings (`pnpm lint` must pass clean)

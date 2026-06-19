# Design System — Agent Instructions

Read this file **before writing any UI code** in this project.
Also read `.claude/SKILL.md` for general project rules.

---

## Purpose

All prototype projects share the same design language. The goal is visual consistency across projects and zero duplication of components. Before creating anything new, verify it doesn't already exist.

> **Where components live:** building blocks, machinery, and tokens are **not** in
> this repo — they live in the shared package **`@6njp/prototype-library`** (source:
> `/Volumes/Development/prototype-library`). See the "component library" section of
> `.claude/SKILL.md`. This project only holds app-specific pages under `src/pages/`.
> A *new reusable component or token is added in the library*, then imported here.

---

## Step 1 — Read the component inventory

Before writing any UI, inspect what already exists in the library:

```bash
# What the library exports (the public API):
cat /Volumes/Development/prototype-library/index.js
cat /Volumes/Development/prototype-library/machinery.js
# Or browse the source components:
find /Volumes/Development/prototype-library/src/features/buildingBlocks -name "*.jsx" | sort
```

---

## Step 2 — Audit before you create

For every UI element the current task requires, work through this decision tree:

1. **Exact match** — the component exists and already covers this use case.
   → Import and use it. Do not recreate.

2. **Near match** — the component exists but lacks a variant, size, or color.
   → Extend the existing component. Do not fork it.

3. **Token match** — no component exists, but it can be built entirely from existing tokens.
   → If it's app-specific, build it locally under `src/pages/<Page>/` as a CSS Module,
   tokens only, and leave a `/* design-system: candidate for buildingBlocks */` comment.
   If it's clearly reusable, prefer adding it to the library (item 4).

4. **No match** — genuinely new reusable primitive.
   → Create it **in the library**, at
   `/Volumes/Development/prototype-library/src/features/buildingBlocks/ComponentName/`,
   add its `export *` line to the library's `index.js`, then import it here.
   (Be on local sources: `pnpm sources:local`.) Lint it in the library dir.
   Flag it: *"Created [Name] in @6njp/prototype-library — not covered by design system."*

**Default to reuse. The burden of proof is on creation.**

---

## Step 3 — Use tokens, never raw values

All token values live in the library at
`/Volumes/Development/prototype-library/src/cssGlobal/` (shipped to consumers via
`@6njp/prototype-library/styles.css`). Raw values are not allowed.

| Need | File | Variable pattern |
|---|---|---|
| Colour | `color.css` | `var(--color-*)` |
| Spacing / sizing | `sizes.css` | `var(--size-*)` |
| Border radius | `sizes.css` | `var(--radius-*)` |
| Transition duration | `sizes.css` | `var(--duration-*)` |
| Font family | `type.css` | `var(--font-family-*)` |
| Font size | `type.css` | `var(--font-size-*)` |
| Font weight | `type.css` | `var(--font-weight-*)` |
| Line height | `type.css` | `var(--line-height-*)` |

```css
/* ✅ correct */
color: var(--color-primary);
gap: var(--size-16);
border-radius: var(--radius-8);
font-size: var(--font-size-16);

/* ❌ wrong */
color: #2563eb;
gap: 16px;
border-radius: 8px;
font-size: 1rem;
```

If a token doesn't exist for what you need, add it to the right `cssGlobal/` file
**in the library** first (on local sources), then use it.

---

## Step 4 — Current building blocks

All imported from `@6njp/prototype-library`; `Location` is the path within the
library source. This is a partial list — confirm against `index.js` (Step 1).

| Component | Variants / API | Location |
|---|---|---|
| `Heading` | `HeadingXs` `HeadingSm` `HeadingMd` `HeadingLg` `HeadingXl` · props: `title`, `h?` (1–6), `layoutClassName?` | `buildingBlocks/Heading/` |
| `Paragraph` | `ParagraphSm` `ParagraphMd` `ParagraphLg` · props: `children`, `layoutClassName?` | `buildingBlocks/Paragraph/` |
| `Button` | `Button` (onClick) · `ButtonLink` (href) · `variant`: `solid`/`outline` · `color`: `blue`/`white` · `icon?`, `layoutClassName?` | `buildingBlocks/Button/` |
| `Link` | `Link` · `LinkUnderline` · props: `href`, `children`, `icon?`, `target?`, `layoutClassName?` | `buildingBlocks/Link/` |
| `Icon` | Pass any Lucide icon component as `icon` prop · `layoutClassName?` controls size | `buildingBlocks/Icon/` |
| `Modal` | `Modal` · props: `isOpen`, `onClose`, `title?`, `children`, `layoutClassName?` | `buildingBlocks/Modal/` |

---

## Step 5 — Patterns for new building blocks

- Folder (in the library): `/Volumes/Development/prototype-library/src/features/buildingBlocks/ComponentName/`
- Files: `ComponentName.jsx` + `ComponentName.module.css` (no other files)
- Add an `export * from './src/features/buildingBlocks/ComponentName/ComponentName.jsx'`
  line to the library's `index.js`
- All exports are **named** — no default exports
- Root element always accepts `layoutClassName?: string`
- **`cx` is a global** — never import it (the consumer's Vite config injects it)
- Cross-component imports inside the library are **relative** (`../Icon/Icon.jsx`) —
  the library has no `@` alias
- CSS class names must start with `component` (Stylelint enforces this)
- Layout properties (`width`, `height`, `margin`, `position`, `flex-grow/shrink/basis`, `z-index`) may only appear in **parent-nested** selectors (`& > .childClass { ... }`)
- Non-layout properties (`padding`, `display`, `gap`, `color`, `font-*`, `border`, `border-radius`, `transition`, etc.) can go directly on any class

---

## Step 6 — Audit summary (required)

End every response that touches UI with:

```
Design system audit
───────────────────
Reused:   [components/tokens used as-is]
Extended: [components you added variants to]
Created:  [new buildingBlocks, with justification]
Raw vals: none  ← must always be "none"
```

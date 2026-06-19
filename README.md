# vite-prototype-template

A minimal Vite + React (JS) template for fast prototyping.

## Stack

- **Vite 8** — dev server + build
- **React 19** — UI
- **CSS Modules** — scoped component styles
- **ESLint 9** (flat config) — linting with 0-warning policy
- **Stylelint 17** — CSS linting with 0-warning policy
- **pnpm** — package manager (strictly enforced)

## First use

```bash
# 1. Clone / fork this repo
# 2. Install deps
pnpm install

# 3. Start prototyping
pnpm start
```

## Commands

| Command | Description |
|---|---|
| `pnpm start` | Start dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Lint (0 warnings allowed) |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm lint:css` | Lint CSS (0 warnings allowed) |
| `pnpm lint:css:fix` | Auto-fix CSS lint issues |

## For AI agents

Read `.claude/SKILL.md` before making any changes.

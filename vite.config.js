import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The shared component library is consumed as RAW SOURCE (.jsx + CSS Modules),
// not a prebuilt bundle. So this project's Vite pipeline must process it exactly
// like first-party src. Three consumption modes have to work:
//
//   • `link:` local   → pnpm SYMLINKS node_modules/@6njp/prototype-library to the
//                       real checkout, so editing library source HOT-RELOADS live
//                       (Fast Refresh) with no reinstall. Two requirements make this
//                       safe: (1) `resolve.dedupe` below forces React (and the other
//                       React-context peers) to resolve to THIS project's single
//                       copy — without it the symlink would pull the library's own
//                       nested copies → "Invalid hook call"; (2) `server.watch`
//                       un-ignores the package so Vite watches it (node_modules is
//                       watch-ignored by default, which would otherwise kill HMR).
//   • `file:` local   → pnpm COPIES the library into its store; served from
//                       …/node_modules/.pnpm/@6njp+prototype-library@file+…/… . Edits
//                       need `pnpm install` here to re-sync — no live HMR.
//   • `github:` install → the package sits INSIDE node_modules/@6njp/… (same shape).
//
// `isOurSource` decides which files get the React/cx injection. It must match the
// library's OWN SOURCE but NEVER anything under a nested node_modules/ inside the
// library (its own react/react-dom/etc. — injecting into those corrupts them, e.g.
// "Identifier React has already been declared").
const LIBRARY_PKG = '@6njp/prototype-library'

function isOurSource(id) {
  // Library source via github install: …/node_modules/@6njp/prototype-library/<rest>
  const installMarker = `/node_modules/${LIBRARY_PKG}/`
  const iInstall = id.indexOf(installMarker)
  if (iInstall !== -1) {
    return !id.slice(iInstall + installMarker.length).includes('node_modules/')
  }

  // Library source via link:/file: real path: …/prototype-library/<rest>
  const linkMarker = '/prototype-library/'
  const iLink = id.indexOf(linkMarker)
  if (iLink !== -1) {
    return !id.slice(iLink + linkMarker.length).includes('node_modules/')
  }

  // First-party app source: anything not in node_modules.
  return !id.includes('/node_modules/')
}

// Authoring convention: components never `import React` and never import `cx`.
// Both are provided here, injected into first-party src AND the library source.
//
// We inject `cx` as a module-local const rather than using Vite's `define`,
// because `define` does NOT reach a dependency that is excluded from
// optimizeDeps (as the raw-source library must be) — it would silently work in
// `vite build` (Rollup applies define globally) but throw a ReferenceError in
// `vite dev`. Injection runs identically in dev and build, so there's no split.
function injectGlobals() {
  return {
    name: 'inject-globals',
    transform(code, id) {
      if (!/\.(jsx|js)$/.test(id)) return null
      if (!isOurSource(id)) return null

      let prelude = ''
      if (!/import React\b/.test(code)) prelude += `import React from 'react'\n`

      const usesCx = /\bcx\s*\(/.test(code)
      const declaresCx = /\b(?:const|let|var|function)\s+cx\b/.test(code) || /import[^\n;]*\bcx\b/.test(code)
      if (usesCx && !declaresCx) prelude += `const cx = (...classes) => classes.filter(Boolean).join(' ')\n`

      return prelude ? { code: prelude + code, map: null } : null
    },
  }
}

export default defineConfig({
  plugins: [
    injectGlobals(),
    // Apply the React (Babel) transform to our src AND the library, but skip
    // every other dependency. The negative lookahead keeps the library in — note
    // the `.*` so it matches the library segment ANYWHERE in the path, not only
    // directly after `node_modules/`. In `link:` mode the library resolves to a
    // bare real path (no node_modules), but in `github:`/remote mode pnpm installs
    // it at `node_modules/.pnpm/@6njp+prototype-library@<hash>/node_modules/@6njp/
    // prototype-library/…`; without `.*` the leading `.pnpm` segment matches this
    // exclude and the library's JSX never gets transformed → broken in remote mode.
    react({
      include: [/\.jsx?$/],
      exclude: [/node_modules\/(?!.*@6njp\/prototype-library\/)/],
    }),
  ],
  css: {
    modules: {
      // camelCase locals: import styles from './Foo.module.css' → styles.myClass
      localsConvention: 'camelCase',
      // Pattern: [filename]__[local]--[hash:5]
      generateScopedName: '[name]__[local]--[hash:5]',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
    // In `link:` mode the library is symlinked to a real path that has its OWN
    // node_modules (pnpm auto-installs its peers there). Dedupe every shared
    // React-context-bearing peer so the app and the library can never end up with
    // two instances ("Invalid hook call", broken floating/gesture context). Always
    // resolve to this project's copy. (All of these are direct deps here.)
    dedupe: ['react', 'react-dom', '@floating-ui/react', '@use-gesture/react'],
  },
  // Consume the library as source, never pre-bundled — so the transforms above
  // (React global, JSX, cx, CSS Modules) all run against it.
  optimizeDeps: {
    exclude: [LIBRARY_PKG],
  },
  server: {
    port: parseInt(process.env.PORT ?? '5176'),
    fs: {
      // Defensive: allow serving from one level up (/Volumes/Development) in case
      // the library ever resolves to a real path outside this project root.
      allow: ['..'],
    },
    watch: {
      // In `link:` mode the library is consumed via a symlink under node_modules,
      // which Vite's watcher ignores by default — killing HMR for library edits.
      // We must un-ignore the library's SOURCE so editing it hot-reloads live, but
      // we must NOT un-ignore the library's OWN nested node_modules: that symlinked
      // checkout has hundreds of transitive dev-dep packages, each shipping a
      // tsconfig.json, and Vite force-reloads the whole page on every tsconfig it
      // sees — an endless "changed tsconfig … forcing full-reload" storm that looks
      // exactly like a runaway rerender loop (the app remounts continuously).
      // `isOurSource` already draws precisely this line (library/app source = watch;
      // anything under a node_modules = ignore), so a function predicate gives exact,
      // glob-ordering-independent control. (A function replaces Vite's default
      // ignores, so re-add .git.)
      ignored: (path) => {
        if (path.includes('/.git/')) return true
        if (path.includes('/node_modules/')) return !isOurSource(path)
        return false
      },
    },
  },
})

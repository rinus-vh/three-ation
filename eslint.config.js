import js from '@eslint/js'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import stylistic from '@stylistic/eslint-plugin'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const eslintPlugin = require('@6njp/eslint-plugin')

export default [
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.js'],
  },

  // Base JS recommended
  js.configs.recommended,

  // Node scripts
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // React files
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@stylistic': stylistic,
      '@6njp': eslintPlugin,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2024,
        cx: 'readonly',    // global provided by vite.config.js define — no import needed
        React: 'readonly', // global injected by injectReactGlobal vite plugin — no import needed
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',       // Not needed with Vite + React 17+
      'react/prop-types': 'off',        // JSDoc serves as prop documentation in this template
      'react/self-closing-comp': 'warn',
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],

      // Hooks
      ...reactHooks.configs.recommended.rules,

      // React Refresh (HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Indentation (auto-fixable) — 2 spaces for JS and JSX
      '@stylistic/indent': ['warn', 2, { SwitchCase: 1, flatTernaryExpressions: true }],
      'react/jsx-indent': ['warn', 2],
      'react/jsx-indent-props': ['warn', 2],

      // General JS
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'object-shorthand': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],

      // @6njp custom rules
      '@6njp/component-properties': 'warn',
      '@6njp/import-sort': 'warn',
      '@6njp/jsx-key': 'warn',
      '@6njp/layout-class-name': 'warn',
      '@6njp/naming-policy': 'warn',
      '@6njp/no-default-export': 'warn',
      '@6njp/no-double-spaces': 'warn',
      '@6njp/no-relative-parent-import': 'warn',
      '@6njp/required-props': 'warn',
      '@6njp/return-whitespace': 'warn',
    },
  },
]

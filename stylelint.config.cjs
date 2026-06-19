'use strict'

/** @type {import('stylelint').Config} */
module.exports = {
  plugins: [
    require.resolve('@6njp/stylelint-plugin/stylelint-plugins/config.js'),
    require.resolve('@6njp/stylelint-plugin/stylelint-plugins/stylistic.mjs'),
  ],

  rules: {
    // ── @6njp custom rules ────────────────────────────────────────────────
    'custom/color-schemes': true,
    'custom/css-global': true,
    'custom/layout-related-properties': true,
    'custom/naming-policy': true,
    'custom/selector-policy': true,
    'custom/parent-child-policy': true,
    'custom/root-policy': true,
    'custom/at-rule-restrictions': true,
    'custom/index': true,
    'custom/reset': true,
    'custom/declaration-group-separator': [true, { severity: 'warning' }],

    // ── Standard rules ────────────────────────────────────────────────────
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'comment-no-empty': true,
    'declaration-block-no-duplicate-properties': [true, {
      ignore: ['consecutive-duplicates-with-different-values'],
    }],
    'declaration-block-no-shorthand-property-overrides': true,
    'font-family-no-duplicate-names': true,
    'function-linear-gradient-no-nonstandard-direction': true,
    'keyframe-declaration-no-important': true,
    'length-zero-no-unit': true,
    'no-duplicate-at-import-rules': true,
    'no-duplicate-selectors': true,
    'no-empty-source': true,
    'property-no-unknown': [true, {
      ignoreSelectors: [':export'],
    }],
    'selector-pseudo-class-no-unknown': [true, {
      ignorePseudoClasses: ['global', 'export'],
    }],
    'selector-pseudo-element-no-unknown': true,
    'selector-type-no-unknown': [true, {
      ignore: ['custom-elements'],
    }],
    'unit-no-unknown': null,
    'at-rule-no-unknown': [true, {
      ignoreAtRules: ['value'],
    }],

    // ── @stylistic rules (formatting, auto-fixable) ───────────────────────
    '@stylistic/indentation': [2, { severity: 'warning' }],
    '@stylistic/selector-combinator-space-before': ['always', { severity: 'warning' }],
    '@stylistic/selector-combinator-space-after': ['always', { severity: 'warning' }],
  },

  ignoreFiles: [
    'node_modules/**',
    'dist/**',
    '**/*.js',
    '**/*.jsx',
    '**/*.svg',
    '**/*.md',
  ],
}

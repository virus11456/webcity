import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Cross-layer imports use @/ or explicit relative module paths (TECH §2.1).
const layers = [
  'data',
  'core',
  'world',
  'sim',
  'bridge',
  'render',
  'input',
  'tools',
  'ui',
  'save',
  'audio',
  'pwa',
];
const dependencies = {
  data: [],
  core: [],
  world: ['data', 'core'],
  sim: ['data', 'core', 'world'],
  bridge: ['data', 'core', 'world'],
  render: ['data', 'core', 'world', 'bridge'],
  input: ['data', 'core', 'world', 'bridge', 'render'],
  tools: ['data', 'core', 'world', 'bridge', 'render'],
  ui: ['data', 'core', 'world', 'bridge', 'tools'],
};

const boundaries = Object.entries(dependencies).map(([layer, allowed]) => {
  const forbidden = layers.filter(
    (target) => target !== layer && !allowed.includes(target),
  );
  const patterns = forbidden.map((target) => ({
    regex:
      target === 'bridge' && layer === 'sim'
        ? '(^|/)bridge($|/(?!protocol(?:\\.[cm]?[jt]s)?$))'
        : `(^|/)${target}($|/|\\.[cm]?[jt]sx?$)`,
    message: `TECH §2.1: ${layer} cannot depend on ${target}.`,
  }));
  patterns.push({
    regex: '(^|/)(main|game)(\\.[cm]?[jt]s)?$',
    message: 'Only the entry point may compose the application.',
  });
  if (['data', 'core', 'world', 'sim', 'bridge', 'ui'].includes(layer)) {
    patterns.push({
      regex: '^three($|/)',
      message: 'Three.js belongs in the rendering layer.',
    });
  }
  if (['data', 'core', 'world', 'sim', 'bridge'].includes(layer)) {
    patterns.push({
      regex: '^(preact($|/)|@preact/)',
      message: 'UI dependencies belong in the UI layer.',
    });
  }
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  };
});

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs}', 'vite.config.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['scripts/smoke.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports (TECH §13).',
        },
      ],
    },
  },
  { files: ['src/ui/**/*.tsx'], rules: { 'no-restricted-syntax': 'off' } },
  ...boundaries,
  {
    files: ['src/{data,core,world,sim,bridge}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'HTMLElement',
        'localStorage',
        'sessionStorage',
      ],
    },
  },
  {
    files: ['src/sim/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use core/rng.ts for deterministic simulation.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Use simulation ticks for game time.',
        },
        { object: 'globalThis', property: 'window' },
        { object: 'globalThis', property: 'document' },
      ],
    },
  },
  prettier,
];

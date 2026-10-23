// Extra Terram — eslint.config.js v0.1.0 — Phase 1 scaffold
// The important part is the src/engine block: the engine must stay headless and deterministic.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const nonDeterministicMath = ['random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'sinh', 'cosh', 'tanh', 'cbrt'];

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.{js,mjs,ts}', 'vite.config.ts'], languageOptions: { globals: { ...globals.node } } },
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'pixi.js', 'pixi.js/*', '@supabase/*', '**/ui/*', '**/render/*', '**/net/*', '**/app/*'],
              message: 'src/engine is headless: no React, no Pixi, no network, no UI imports.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        ...nonDeterministicMath.map((property) => ({
          object: 'Math',
          property,
          message:
            property === 'random'
              ? 'Use the seeded RNG in engine/rng.ts.'
              : `Math.${property} is not bit-identical across JS engines; use integer math, sqrt, or a lookup table.`,
        })),
        { object: 'Date', property: 'now', message: 'No wall clock in the sim; time is the tick counter.' },
        { object: 'performance', property: 'now', message: 'No wall clock in the sim; time is the tick counter.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'fetch', 'localStorage'],
    },
  },
);

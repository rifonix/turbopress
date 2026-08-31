// Minimal flat config — lints plain JS (plugin assets, scripts, config).
// TypeScript/TSX linting (typescript-eslint + react plugins) is a deliberate
// follow-up; tsc --noEmit currently gates all TS packages.
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/coverage/**',
      'packages/flying-press*/**',
      'packages/nitropack/**',
      'packages/airlift/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-constant-condition': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-fallthrough': 'error',
    },
  },
];

import nextVitals from 'eslint-config-next/core-web-vitals';

// Flat config (ESLint 9/10) replacing the legacy .eslintrc.json chain.
// eslint-config-next already wires the TS parser/plugin + core-web-vitals;
// we only re-apply the repo-wide rule tweaks from the root .eslintrc.json.
export default [
  ...nextVitals,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // react-hooks v7 compiler-correctness rules — advisory for this
      // codebase (predates the React Compiler); warnings not errors.
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
];

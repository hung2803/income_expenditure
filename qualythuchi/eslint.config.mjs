import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/worker-configuration.d.ts', '.npm-cache/**', 'coverage/**', 'playwright-report/**', 'test-results/**', '.preview/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/backend/scripts/**/*.mjs', 'apps/backend/test/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', Request: 'readonly', Response: 'readonly', structuredClone: 'readonly' } }
  },
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] }
  }
);

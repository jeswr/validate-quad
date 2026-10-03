import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const style = {
  indent: ['error', 2, { SwitchCase: 0 }],
  quotes: ['error', 'single', { avoidEscape: true }],
  semi: ['error', 'always'],
  'comma-dangle': ['error', 'always-multiline'],
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: 'error',
  // Unicode character classes deliberately contain combining characters and joiners
  'no-misleading-character-class': 'off',
};

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'test/types/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { ...style, '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }] },
  },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: style,
  },
);

/* eslint-env node */
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'bundle/',
    'coverage/',
    '*.config.js',
    '*.config.ts',
    'scripts/'
  ],
  rules: {
    // 保持宽松：避免对既有代码造成大量 error，只做轻度提示
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'error',
    'semi': ['warn', 'always'],
    'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    // 已有大量 any/non-null 用法，不强约束
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
    // 既有代码中的历史问题，降级为 warn 不阻断 CI
    'no-constant-condition': 'warn',
    'no-control-regex': 'warn',
    '@typescript-eslint/no-unsafe-function-type': 'warn'
  },
  settings: {
    react: { version: 'detect' }
  }
};

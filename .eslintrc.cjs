/** @type{import('eslint').Linter.Config} */
const config = {
  root: true,
  extends: [
    'eslint:recommended',
    'prettier',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  parser: '@typescript-eslint/parser',
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
  overrides: [
    {
      files: ['./src/**/*.{ts,tsx}'],
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
  ],
  rules: {
    'prettier/prettier': 'error',
    'import/order': [
      'warn',
      {
        groups: [
          ['builtin', 'external'],
          'internal',
          ['parent', 'index', 'sibling'],
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
        },
      },
    ],
    'import/consistent-type-specifier-style': ['warn', 'prefer-top-level'],
  },
}

module.exports = config

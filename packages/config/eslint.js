import { defineConfig, globalIgnores } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint flat config for every DomuSafe workspace package.
 *
 * Contract: type-aware `strict-type-checked` rules on all TypeScript, mandatory TSDoc on exported
 * source symbols (purpose, preconditions, postconditions live in the description), and module
 * boundaries for `apps/api/src/modules/*`: a module may not import another module's repository.
 *
 * @param {{ rootDir: string }} options - `rootDir` is the repository root used by the type-aware parser.
 * @returns {import('eslint').Linter.Config[]} Flat config array.
 */
export function domusafeEslint({ rootDir }) {
  return defineConfig(
    globalIgnores([
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'legacy/**',
      'docs/**',
      '**/*.js',
      '**/*.mjs',
    ]),
    {
      files: ['**/*.ts'],
      extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // Fastify plugins and hooks are async by contract even when they do not await.
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
      },
    },
    {
      files: ['**/src/**/*.ts'],
      ignores: ['**/*.test.ts'],
      plugins: { jsdoc, tsdoc },
      rules: {
        'tsdoc/syntax': 'error',
        'jsdoc/require-jsdoc': [
          'error',
          {
            publicOnly: true,
            require: {
              FunctionDeclaration: true,
              ClassDeclaration: true,
              MethodDefinition: true,
              ArrowFunctionExpression: true,
              FunctionExpression: true,
            },
            contexts: [
              'TSInterfaceDeclaration',
              'TSTypeAliasDeclaration',
              'ExportNamedDeclaration > VariableDeclaration',
            ],
          },
        ],
        'jsdoc/require-description': ['error', { contexts: ['any'] }],
      },
    },
    {
      files: ['apps/api/src/modules/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../*/repository.js', '../*/repository'],
                message: 'Use the other module service interface; repositories are module-private.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  );
}

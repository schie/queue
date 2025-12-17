import eslintConfigPrettier from 'eslint-config-prettier'
import pluginSecurity from 'eslint-plugin-security'
import neostandard, { resolveIgnoresFromGitignore } from 'neostandard'

export default [
  // Base config with TypeScript and gitignore integration
  ...neostandard({
    ts: true,
    ignores: resolveIgnoresFromGitignore(),
    filesTs: ['src/**/*.ts', '__tests__/**/*.ts']
  }),

  // Security rules
  pluginSecurity.configs.recommended,

  // Turn off conflicting formatting rules to defer to Prettier
  eslintConfigPrettier,

  // Custom tweaks
  {
    rules: {
      'n/no-process-exit': 'warn',
      'n/no-unsupported-features': 'off',
      'n/no-unpublished-require': 'off',

      // Prettier conflict fix
      '@stylistic/space-before-function-paren': 'off',

      // Disable rarely useful rules
      'n/hashbang': 'off',

      // Disable security warnings for test and image processing files
      'security/detect-object-injection': 'off'
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module'
    }
  },

  // Test files configuration
  {
    files: ['__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    }
  }
]

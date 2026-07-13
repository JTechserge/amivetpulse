import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      // Interdit toute injection innerHTML/outerHTML/insertAdjacentHTML sans commentaire
      // de désactivation explicite. Chaque sink restant est vérifié : soit constantes
      // internes, soit variables passées par escapeHTML() avant interpolation.
      'no-unsanitized/property': 'error',
      'no-unsanitized/method':   'error',
    },
  },
];

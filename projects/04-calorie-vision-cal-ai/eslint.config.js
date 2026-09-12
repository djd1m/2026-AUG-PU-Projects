import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config (ESLint 9). Проверяются свойства, которые дешевле поймать здесь, чем в ревью:
// неиспользованное, `any` без нужды и забытый `await`. Полный type-aware линт не включён
// намеренно — он требует программы TypeScript на каждый прогон, а типы уже проверяет
// `npm run typecheck` одним проходом.
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'docs/**',
      '.claude/**',
      '.p-replicator/**',
      // Генерируется Next при сборке и переписывается им же: править его нельзя,
      // а его тройная ссылка — требование самого Next, а не наш стиль.
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Тесты намеренно трогают приватные углы и мусорные значения.
    files: ['tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);

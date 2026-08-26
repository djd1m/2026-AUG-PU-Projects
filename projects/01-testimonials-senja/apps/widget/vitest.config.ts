import { defineConfig } from 'vitest/config';

// .claude/rules/testing.md §2: виджет тестируется в DOM, которым не управляет тестовый раннер —
// jsdom даёт Shadow DOM/MutationObserver для unit- и component-уровня этого пакета. Полная
// проверка на агрессивно-стилизованном хосте на ВТОРОМ origin (реальный каскад CSS, реальный
// layout) — задача browser-based E2E вне этого пакета, см. tests/isolation.test.ts и
// tests/badge-integrity.test.ts за пометками [GAP] на этот счёт.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
});

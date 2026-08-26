import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Тесты на SKIP LOCKED открывают реальные параллельные соединения к тестовой
    // Postgres (testing.md §1: "Integration ... с реальной тестовой Postgres") —
    // не годится гонять их в изолированных воркерах с общим пулом по умолчанию.
    fileParallelism: false,
  },
});

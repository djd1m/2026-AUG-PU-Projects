# N6b — multi-stage, контекст сборки = корень монорепо projects/06b-rag-class (там package-lock.json;
# compose-hygiene.md, правило 5). Цели: web (Next.js 15 + отдача w.js), worker (обход, PDF, эмбеддинги), migrate.
# СКЕЛЕТ Фазы 4: пути ниже — целевая структура docs/Architecture.md; до фичи foundation сборка падает на COPY
# манифестов. Проверяется запуском `bash ../../scripts/check-compose-buildable.sh`, а не рассуждением.

# ── deps: манифесты ВСЕХ workspace, иначе npm ci падает «Exit handler never called» ──
FROM node:22.22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/widget/package.json ./apps/widget/
COPY services/worker/package.json ./services/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/rag/package.json ./packages/rag/
RUN npm ci

# ── prod-deps: без devDependencies — только они едут в рантайм ──
FROM deps AS prod-deps
RUN npm prune --omit=dev

# ── build: один раз для всех целей; виджет собирается esbuild и проверяется бюджетом ≤ 30 KB gzip ──
FROM deps AS build
COPY . .
RUN npm run build

# ── web ──
FROM node:22.22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3000
USER node
CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3000"]

# ── worker ──
FROM node:22.22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/services/worker/dist ./services/worker/dist
COPY --from=build /app/services/worker/package.json ./services/worker/package.json
COPY --from=build /app/packages ./packages
USER node
CMD ["node", "services/worker/dist/main.js"]

# ── migrate: one-shot, роль владельца БД; создаёт расширение vector, таблицы, роли, RLS, HNSW ──
FROM node:22.22-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/db ./packages/db
USER node
CMD ["node", "packages/db/dist/migrate.js"]

# N6 «Суфлёр» — multi-stage, контекст сборки = КОРЕНЬ монорепо проекта (иначе package-lock.json
# недоступен и `npm ci` невозможен — compose-hygiene.md, правило 5).
# Цели: web (Next.js + статика бандла виджета), worker (индексация, без браузера — ADR-007),
# migrate (одноразовые миграции), test (раннер с dev-зависимостями).
# СКАФФОЛД Phase 3/4: кода нет, сборкой не проверен — первое дело фичи foundation.

# ── deps: манифесты ВСЕХ workspace, иначе npm ci падает «Exit handler never called» ──
FROM node:22.22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/widget/package.json ./apps/widget/
COPY packages/db/package.json ./packages/db/
COPY packages/rag/package.json ./packages/rag/
COPY packages/queue/package.json ./packages/queue/
RUN npm ci

# ── build: корневой скрипт собирает виджет ПЕРВЫМ (его бандл — статика web, сборка падает
# при > 45 КБ gzip), затем web и worker ──
FROM deps AS build
COPY . .
RUN npm run build

# ── web: SSR Next.js, раздаёт apps/web/public/w/widget.<hash>.js ──
FROM node:22.22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3000
# CMD ссылается на скрипт, существующий В ЭТОМ package.json workspace (грабля клона N5)
CMD ["npm", "run", "start", "--workspace=apps/web"]

# ── worker: краулер, pdfjs, чанкинг, эмбеддинги; браузера НЕТ (страж манифеста, ADR-007) ──
FROM node:22.22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages ./packages
CMD ["npm", "run", "start", "--workspace=apps/worker"]

# ── migrate: CREATE EXTENSION vector, схема, HNSW; завершается кодом 0 или валит запуск ──
FROM node:22.22-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
CMD ["npm", "run", "migrate", "--workspace=packages/db"]

# ── test: dev-зависимости и исходники; ходит в настоящие db/redis стека n6-test ──
FROM build AS test
ENV NODE_ENV=test TZ=Europe/Moscow
CMD ["npm", "test", "--", "--run"]

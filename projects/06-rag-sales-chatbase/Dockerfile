# N6 «Суфлёр» — multi-stage, контекст сборки = КОРЕНЬ монорепо проекта (иначе package-lock.json
# недоступен и `npm ci` невозможен — compose-hygiene.md, правило 5).
# из N5: projects/05-podcast-clips-opus/Dockerfile — цели web/worker/test; добавлена цель migrate;
# без ffmpeg/OpenCV (у N6 нет медиа) и без браузера в worker (ADR-007).
# Цели: web (Next.js), worker (worker-index), migrate (одноразовые миграции), test (раннер с dev-зависимостями).
# Workspace apps/widget появится со своей фичей — тогда же его манифест сюда; packages/queue — с index-job-core.

# ── deps: манифесты ВСЕХ workspace, иначе npm ci падает «Exit handler never called» ──
FROM node:22.22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/rag/package.json ./packages/rag/
COPY packages/queue/package.json ./packages/queue/
RUN npm ci

# ── build: один раз для всех рантайм-целей (rag → db → queue → worker → web) ──
FROM deps AS build
COPY . .
RUN npm run build

# ── web: SSR Next.js; preflight (LoadCeilings) ДО next start — код 1 и имя переменной ──
FROM node:22.22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3000
# CMD ссылается на файлы, а не на `npm start` в корне (грабля клона N5); exec — сигналы доходят до next
CMD ["sh", "-c", "node apps/web/.next/preflight/preflight.js && exec node node_modules/next/dist/bin/next start apps/web"]

# ── worker: worker-index; браузера НЕТ (ADR-007) ──
FROM node:22.22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages ./packages
CMD ["node", "apps/worker/dist/index.js"]

# ── migrate: CREATE EXTENSION vector, схема, HNSW; завершается кодом 0 или валит запуск ──
FROM node:22.22-alpine AS migrate
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
CMD ["node", "packages/db/dist/migrate.js"]

# ── test: dev-зависимости и исходники; ходит в настоящие db/redis стека n6-test ──
FROM build AS test
ENV NODE_ENV=test TZ=Europe/Moscow
CMD ["npm", "test", "--", "--run"]

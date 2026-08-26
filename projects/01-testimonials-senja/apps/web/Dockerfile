# apps/web — Next.js приложение монолита.
# Здесь исполняются: форма сбора, модерация, публичная стена /w/<slug>,
# выдача конфигурации виджета (FR-GROWTH-003) и платёжные вебхуки (FR-008).
#
# Контекст сборки — КОРЕНЬ монорепо (docker-compose.yml: context: .), потому что
# package-lock.json в npm workspaces один и лежит только там.

FROM node:22-alpine AS deps
WORKDIR /app
# Манифесты ВСЕХ рабочих пространств, а не только корневой: npm ci сверяет весь
# lock-tree целиком и без них падает («Exit handler never called!» — см. D-008).
COPY package.json package-lock.json ./
COPY apps/web/package.json        apps/web/package.json
COPY apps/widget/package.json     apps/widget/package.json
COPY packages/db/package.json     packages/db/package.json
COPY services/worker/package.json services/worker/package.json
COPY services/transcribe/package.json services/transcribe/package.json
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json        apps/web/package.json
COPY apps/widget/package.json     apps/widget/package.json
COPY packages/db/package.json     packages/db/package.json
COPY services/worker/package.json services/worker/package.json
COPY services/transcribe/package.json services/transcribe/package.json
RUN npm ci
COPY . .
# Бандл виджета собирается здесь и кладётся в public/ с content-hash в имени (ADR-007).
RUN npm run build:widget && npm run build --workspace apps/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Не root: контейнер смотрит наружу через Caddy.
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules          ./node_modules
# Next собирает в apps/web/.next, а не в корень контекста — путь копирования обязан
# совпадать с рабочим пространством, иначе рантайм стартует на пустоте.
COPY --from=build /app/apps/web/.next        ./apps/web/.next
COPY --from=build /app/apps/web/public       ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
# packages/db отдаётся как TS-исходники (exports: ./src/index.ts) и резолвится симлинком
# из node_modules — без него рантайм не найдёт слой доступа к данным.
COPY --from=build /app/packages/db           ./packages/db
COPY --from=build /app/package.json          ./package.json
USER app
EXPOSE 3000
# `npm start` в корне не существует — скрипт объявлен в рабочем пространстве apps/web.
CMD ["npm", "start", "--workspace", "apps/web"]

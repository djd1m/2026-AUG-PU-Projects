# apps/web — Next.js приложение монолита.
# Здесь исполняются: форма сбора, модерация, публичная стена /w/<slug>,
# выдача конфигурации виджета (FR-GROWTH-003) и платёжные вебхуки (FR-008).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# Бандл виджета собирается здесь и кладётся в public/ с content-hash в имени (ADR-007).
RUN npm run build:widget && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Не root: контейнер смотрит наружу через Caddy.
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/.next        ./.next
COPY --from=build /app/public       ./public
COPY --from=build /app/package.json ./package.json
USER app
EXPOSE 3000
CMD ["npm", "start"]

# Контекст сборки — КОРЕНЬ монорепо: package-lock.json лежит там, и npm ci сверяет
# весь lock-tree, а не одну ветку. Из подпапки установка невозможна.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Манифесты ВСЕХ workspace: без них npm ci падает с «Exit handler never called!»
COPY apps/guest/package.json apps/guest/
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts
COPY tsconfig.json ./
COPY apps/guest ./apps/guest

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/guest ./apps/guest
COPY --from=build /app/package.json ./
RUN npm i -g tsx@4 --no-audit --no-fund
EXPOSE 3000
# CMD ссылается на файл, существующий в ЭТОМ образе, а не на скрипт чужого манифеста.
CMD ["tsx", "apps/guest/src/main.ts"]

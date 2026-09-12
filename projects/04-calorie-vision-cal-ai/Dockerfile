# N4 «Тарелка» — multi-stage для монорепо npm workspaces.
# Контекст сборки — КОРЕНЬ проекта: package-lock.json лежит только там, и из подпапки
# `npm ci` невозможен. Пять граблей workspaces в Docker учтены явно
# (../../.claude/rules/compose-hygiene.md, правило 5).
#
# Исходников ещё нет: этот файл соберётся только после фичи `foundation`. Он приложен как
# контракт сборки, а не как проверенный артефакт — «логика Dockerfile не проверена сборкой»
# уже один раз оказалась тремя реальными дефектами (правило 6 того же документа).

# ─────────────────────────────────────────────────────────────────────────────
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ВНИМАНИЕ, ПРОВЕРИТЬ ПРИ ПЕРВОЙ СБОРКЕ: `sharp` нужен HEIC/HEIF (формат камеры iPhone по
# умолчанию, FR-CAPTURE-002). Стандартная предсобранная libvips поддержку HEIF НЕ включает.
# Если проверка ниже падает — доустановить libvips с libheif системным пакетом ИЛИ собрать
# sharp из исходников. Молча уронить HEIC нельзя: это отказ половине аудитории на первом кадре.

# npm ci сверяет ВЕСЬ lock-tree, поэтому манифесты нужны от ВСЕХ workspace, а не от одного.
COPY package.json package-lock.json ./
COPY apps/web/package.json          apps/web/package.json
COPY apps/api/package.json          apps/api/package.json
COPY apps/recognizer/package.json   apps/recognizer/package.json
COPY packages/db/package.json       packages/db/package.json
COPY packages/shared/package.json   packages/shared/package.json
RUN npm ci --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
# .dockerignore обязателен: без него COPY . . утащит node_modules, .next и .env в слой.
COPY . .
RUN npm run build --workspaces --if-present \
 && node -e "const s=require('sharp');if(!s.format.heif||!s.format.heif.input.file){console.error('sharp собран БЕЗ HEIF — FR-CAPTURE-002 неисполним');process.exit(1)}"

# ─────────────────────────────────────────────────────────────────────────────
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS api
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
# COPY из ПУТИ WORKSPACE, а не из /app: сборка кладёт результат в apps/api/dist,
# и COPY /app/dist дал бы рантайм на пустом месте.
COPY --from=build --chown=node:node /app/node_modules            /app/node_modules
COPY --from=build --chown=node:node /app/package.json            /app/package.json
COPY --from=build --chown=node:node /app/packages                /app/packages
COPY --from=build --chown=node:node /app/apps/api/package.json   /app/apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist           /app/apps/api/dist
USER node
EXPOSE 3000
WORKDIR /app/apps/api
# CMD указывает на скрипт, существующий в ЭТОМ package.json, а не в корневом манифесте.
CMD ["npm", "run", "start"]

# ─────────────────────────────────────────────────────────────────────────────
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS recognizer
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build --chown=node:node /app/node_modules                   /app/node_modules
COPY --from=build --chown=node:node /app/package.json                   /app/package.json
COPY --from=build --chown=node:node /app/packages                       /app/packages
COPY --from=build --chown=node:node /app/apps/recognizer/package.json   /app/apps/recognizer/package.json
COPY --from=build --chown=node:node /app/apps/recognizer/dist           /app/apps/recognizer/dist
USER node
# Портов не слушает вовсе: HTTP-запросов извне не принимает (Architecture.md, Component Breakdown).
WORKDIR /app/apps/recognizer
CMD ["npm", "run", "start"]

# ─────────────────────────────────────────────────────────────────────────────
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow NEXT_TELEMETRY_DISABLED=1
# Секретов вызова наружу у web нет и не появляется: ни ключа модели, ни токена бота.
COPY --from=build --chown=node:node /app/node_modules            /app/node_modules
COPY --from=build --chown=node:node /app/package.json            /app/package.json
COPY --from=build --chown=node:node /app/packages                /app/packages
COPY --from=build --chown=node:node /app/apps/web/package.json   /app/apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/.next          /app/apps/web/.next
COPY --from=build --chown=node:node /app/apps/web/public         /app/apps/web/public
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npm", "run", "start"]

# services/transcribe — единственная точка входа к внешнему STT-провайдеру (OpenAI).
#
# ADR-005 (переписан по D-007): в продукте нет ни одного пути, где модель порождает текст
# отзыва. Раньше здесь был Claude API за MCP-протоколом (mcp-claude) — Claude API не принимает
# аудио, вся ветка была невыполнима технически. Теперь — plain HTTP-сервис, OpenAI STT.
# OPENAI_API_KEY доступен только здесь: web и worker его не видят (как раньше ANTHROPIC_API_KEY).
#
# ffmpeg остаётся ЗДЕСЬ (не переезжает в worker) — Architecture.md §5, шаги 3-4 закрепляют
# извлечение аудио-дорожки за этим сервисом, тот же принцип, что был закреплён для mcp-claude
# ("сервис скачивает видео, отправляет аудио-дорожку в STT-провайдера"), не за worker.
#
# КОНТЕКСТ СБОРКИ — КОРЕНЬ РЕПОЗИТОРИЯ, не ./services/transcribe (D-008, Phase 3 /start).
# Причина: это монорепо на npm workspaces с ЕДИНСТВЕННЫМ package-lock.json в корне.
# `npm ci` без lockfile падает, а в services/transcribe/ его нет и быть не должно.
# Соответствующий build.context задан в docker-compose.yml.

# --- сборка TypeScript -> dist/ ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
# npm ci сверяет ВЕСЬ lock-tree, а не только целевой workspace: без манифестов
# остальных пакетов он падает с «Exit handler never called!» (D-008). Манифесты
# копируются до исходников — слой кэшируется и не инвалидируется правкой кода.
COPY apps/widget/package.json       ./apps/widget/
COPY packages/db/package.json       ./packages/db/
COPY services/worker/package.json   ./services/worker/
COPY services/transcribe/package.json ./services/transcribe/
RUN npm ci --workspace @proofwall/transcribe --include-workspace-root
COPY services/transcribe ./services/transcribe
RUN npm run build --workspace @proofwall/transcribe

# --- prod-зависимости отдельным слоем: в runtime не попадают devDependencies ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/widget/package.json       ./apps/widget/
COPY packages/db/package.json       ./packages/db/
COPY services/worker/package.json   ./services/worker/
COPY services/transcribe/package.json ./services/transcribe/
RUN npm ci --omit=dev --workspace @proofwall/transcribe --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg — извлечение звуковой дорожки из видео перед отправкой в OpenAI STT API (§5).
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules                 ./node_modules
COPY --from=build /app/services/transcribe/dist     ./dist
COPY services/transcribe/package.json               ./package.json
USER app
EXPOSE 7331
# Проверка живости сервиса — тот же GET /health, что дергает compose (server.ts).
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7331/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

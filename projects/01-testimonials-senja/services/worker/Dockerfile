# services/worker — фоновые задачи.
# Забирает transcript_status='pending' через SELECT ... FOR UPDATE SKIP LOCKED,
# вызывает services/transcribe, чистит rate_limit_events раз в час.
#
# ffmpeg здесь НЕ ставится — он в services/transcribe/Dockerfile. Architecture.md §5, шаг 3-4
# закрепляет извлечение аудио-дорожки за transcribe: worker лишь формирует presigned GET URL
# из video_object_key (шаг 3) и передаёт его в POST /transcribe — сам видео/аудио не декодирует
# и не скачивает. См. services/transcribe/README.md.
#
# КОНТЕКСТ СБОРКИ — КОРЕНЬ РЕПОЗИТОРИЯ, не ./services/worker (D-008, Phase 3 /start).
# Причина: монорепо на npm workspaces с ЕДИНСТВЕННЫМ package-lock.json в корне; `npm ci`
# без lockfile падает. Соответствующий build.context задан в docker-compose.yml.

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
RUN npm ci --workspace @proofwall/worker --include-workspace-root
COPY services/worker ./services/worker
RUN npm run build --workspace @proofwall/worker

# --- prod-зависимости отдельным слоем ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/widget/package.json       ./apps/widget/
COPY packages/db/package.json       ./packages/db/
COPY services/worker/package.json   ./services/worker/
COPY services/transcribe/package.json ./services/transcribe/
RUN npm ci --omit=dev --workspace @proofwall/worker --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules             ./node_modules
COPY --from=build /app/services/worker/dist     ./dist
COPY services/worker/package.json               ./package.json
USER app
CMD ["node", "dist/index.js"]

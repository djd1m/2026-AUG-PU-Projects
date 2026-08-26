# services/worker — фоновые задачи.
# Забирает transcript_status='pending' через SELECT ... FOR UPDATE SKIP LOCKED,
# вызывает mcp-claude, чистит rate_limit_events раз в час.
#
# ИСПРАВЛЕНИЕ (Phase 2, /start): ffmpeg здесь БОЛЬШЕ НЕ СТАВИТСЯ — перенесён в
# services/mcp-claude/Dockerfile. Architecture.md §5, шаг 3-4 закрепляет извлечение
# аудио-дорожки за mcp-claude ("MCP-сервер скачивает видео, отправляет аудио-дорожку
# в Claude API"), не за worker: worker лишь формирует presigned GET URL из
# video_object_key (шаг 3) и передаёт его в MCP tool transcribe_video — сам видео/аудио
# не декодирует и не скачивает. См. services/mcp-claude/README.md
# "Исправление Dockerfile" для полного обоснования.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER app
CMD ["node", "dist/index.js"]

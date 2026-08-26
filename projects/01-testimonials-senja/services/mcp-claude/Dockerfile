# services/mcp-claude — единственная точка входа к Claude API.
#
# ADR-005: у сервиса РОВНО ОДИН tool — transcribe_video.
# Tool'а «переписать отзыв» не существует физически, поэтому нарушить
# FTC Rule (16 CFR Part 465) нечем, а не «запрещено инструкцией».
# ANTHROPIC_API_KEY доступен только здесь: web и worker его не видят.
#
# ИСПРАВЛЕНИЕ (Phase 2, /start): ffmpeg перенесён сюда из services/worker/Dockerfile.
# Architecture.md §5, шаг 3-4 явно закрепляет извлечение аудио-дорожки за mcp-claude
# ("MCP-сервер скачивает видео, отправляет аудио-дорожку в Claude API"), а не за
# worker — исходный Dockerfile worker'а ставил ffmpeg по устаревшему прочтению
# Pseudocode.md §1.1 без сверки с Architecture (канон при расхождении — Architecture,
# см. Architecture §10). Без этой правки контейнер mcp-claude падал бы на вызове
# ffmpeg, которого физически нет в его образе.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg — извлечение звуковой дорожки из видео перед отправкой в Claude API (§5).
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER app
EXPOSE 7331
CMD ["node", "dist/server.js"]

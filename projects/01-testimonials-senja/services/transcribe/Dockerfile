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
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg — извлечение звуковой дорожки из видео перед отправкой в OpenAI STT API (§5).
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER app
EXPOSE 7331
CMD ["node", "dist/server.js"]

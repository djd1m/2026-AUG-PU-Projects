# services/worker — фоновые задачи.
# Забирает transcript_status='pending' через SELECT ... FOR UPDATE SKIP LOCKED,
# вызывает mcp-claude, чистит rate_limit_events раз в час.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# ffmpeg нужен для извлечения аудиодорожки перед транскрипцией.
RUN apk add --no-cache ffmpeg \
 && addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER app
CMD ["node", "dist/index.js"]

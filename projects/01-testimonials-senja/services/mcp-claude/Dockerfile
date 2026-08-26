# services/mcp-claude — единственная точка входа к Claude API.
#
# ADR-005: у сервиса РОВНО ОДИН tool — transcribe_video.
# Tool'а «переписать отзыв» не существует физически, поэтому нарушить
# FTC Rule (16 CFR Part 465) нечем, а не «запрещено инструкцией».
# ANTHROPIC_API_KEY доступен только здесь: web и worker его не видят.
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
EXPOSE 7331
CMD ["node", "dist/server.js"]

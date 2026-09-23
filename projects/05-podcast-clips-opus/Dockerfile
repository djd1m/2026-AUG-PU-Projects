# N5 «КлипМейкер» — multi-stage, контекст сборки = КОРЕНЬ монорепо (иначе package-lock.json
# недоступен и `npm ci` невозможен — compose-hygiene.md, правило 5).
# Цели: web (Next.js), worker (ffmpeg + ffprobe), test (раннер с dev-зависимостями).

# ── deps: манифесты ВСЕХ workspace, иначе npm ci падает «Exit handler never called» ──
FROM node:22.22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/s3/package.json ./packages/s3/
COPY packages/queue/package.json ./packages/queue/
RUN npm ci

# ── build: один раз для обеих рантайм-целей ──
FROM deps AS build
COPY . .
RUN npm run build

# ── web: SSR Next.js; НЕТ ffmpeg/ffprobe (канон §6: медиа-инструменты только у воркеров) ──
FROM node:22.22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3000
# CMD ссылается на скрипт, существующий В ЭТОМ package.json (грабля клона: npm start в корне)
CMD ["sh", "-c", "node apps/web/.next/preflight/preflight.js && exec node node_modules/next/dist/bin/next start apps/web"]

# ── worker: ffmpeg 7 и ffprobe; один образ на три контейнера, команда задаётся в compose ──
FROM node:22.22-alpine AS worker
WORKDIR /app
# ffmpeg в alpine приносит ffprobe той же версии; проверяется при сборке, а не предполагается.
# python3 и OpenCV — ради поиска лиц (FR-2): кадрирование ставится по ЛЮДЯМ, а не по половинам
# кадра. Измерено 23.09.2026 на живом клипе: вслепую нижняя панель пуста в 10 замерах из 12.
# Детектор YuNet входит в состав самого OpenCV; модель лежит в assets и в сеть не ходит.
RUN apk add --no-cache ffmpeg python3 py3-opencv py3-numpy \
 && ffmpeg -version && ffprobe -version \
 && python3 -c "import cv2; assert hasattr(cv2, 'FaceDetectorYN'), 'OpenCV без YuNet'; print(cv2.__version__)"
ENV NODE_ENV=production TZ=Europe/Moscow
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/worker/assets ./apps/worker/assets
COPY --from=build /app/apps/worker/dist ./dist/apps/worker
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages ./packages
CMD ["node", "dist/apps/worker/workers/stt.js"]

# ── test: dev-зависимости и исходники; ходит в настоящие db/redis/minio профиля test ──
FROM build AS test
RUN apk add --no-cache ffmpeg && ffmpeg -version && ffprobe -version
ENV NODE_ENV=test TZ=Europe/Moscow
CMD ["npm", "test", "--", "--run"]

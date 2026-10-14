FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
USER root
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-rus fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node apps/worker/package.json apps/worker/package.json
COPY --chown=node:node packages/domain/package.json packages/domain/package.json
COPY --chown=node:node packages/db/package.json packages/db/package.json
COPY --chown=node:node packages/adapters/package.json packages/adapters/package.json
COPY --chown=node:node packages/viewer/package.json packages/viewer/package.json
RUN npm ci --no-fund --no-audit
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN mkdir -p /app/.runtime/assets && chown -R node:node /app/.runtime
USER node
ENV NODE_ENV=production
CMD ["npm", "run", "start:web"]

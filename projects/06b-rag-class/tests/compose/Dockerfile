# Образ прогона ВСЕХ наборов (typecheck, unit, integration) для compose.test.yml. Контекст — корень монорепо.
# Свой ignore-файл (Dockerfile.dockerignore рядом): тестам нужны tests/ и .claude/feature-roadmap.json, которые рабочий
# .dockerignore исключает. Сеть нужна только при сборке (npm ci); прогон идёт во внутренней сети без интернета.
FROM node:22.22-bookworm-slim
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/web/package.json ./apps/web/
COPY --chown=node:node apps/widget/package.json ./apps/widget/
COPY --chown=node:node services/worker/package.json ./services/worker/
COPY --chown=node:node packages/db/package.json ./packages/db/
COPY --chown=node:node packages/rag/package.json ./packages/rag/
RUN npm ci
COPY --chown=node:node . .
CMD ["sh", "-c", "npm run typecheck && npm test && npm run test:int"]

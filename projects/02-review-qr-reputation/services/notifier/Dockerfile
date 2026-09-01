FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/notifier/package.json services/notifier/
RUN npm ci --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev --ignore-scripts
COPY tsconfig.json ./
COPY services/notifier ./services/notifier

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/notifier ./services/notifier
COPY --from=build /app/package.json ./
RUN npm i -g tsx@4 --no-audit --no-fund
CMD ["tsx", "services/notifier/src/main.ts"]

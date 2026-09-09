FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY shared ./shared
COPY apps/api ./apps/api
COPY tests ./tests
COPY scripts ./scripts
COPY variants ./variants
ENV N3_MODE=fixture
# Compose file secrets preserve host mode0600. Root reads the secret, then server
# drops to uid/gid1000 before it accepts any request (verified by HTTP tests).
CMD ["node", "apps/api/server.mjs"]

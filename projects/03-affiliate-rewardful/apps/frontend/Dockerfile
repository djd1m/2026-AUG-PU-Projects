FROM node:22.22.0-bookworm-slim
ARG VARIANT
WORKDIR /app
COPY apps/frontend/server.mjs ./server.mjs
COPY variants/${VARIANT}/app/ ./public/
COPY variants/${VARIANT}/docs/demo.html ./public/demo.html
COPY docs/demos ./public/demos
COPY shared/client ./public/shared/client
COPY shared/ui ./public/shared/ui
COPY apps/frontend/fixtures/mobile.html ./public/mobile.html
COPY apps/frontend/fixtures ./public/_fixtures
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]

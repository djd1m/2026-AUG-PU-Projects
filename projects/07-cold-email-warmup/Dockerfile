FROM node:22.20.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json eslint.config.js ./
COPY src ./src
COPY db ./db
COPY tests ./tests
RUN npm run build
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

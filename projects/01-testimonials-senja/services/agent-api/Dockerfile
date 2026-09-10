FROM node:22.22.0-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/main.mjs"]

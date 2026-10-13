FROM node:22.20.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional && npm cache clean --force
COPY web ./web
COPY db ./db
COPY scripts ./scripts
RUN mkdir -p /private && chown node:node /private
USER node
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
EXPOSE 8080
CMD ["npm","start"]

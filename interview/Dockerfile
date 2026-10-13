FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=8098 BASE_PATH=/interview
EXPOSE 8098
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "src/server.js"]

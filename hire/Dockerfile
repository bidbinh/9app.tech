FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
COPY public ./public
ENV NODE_ENV=production PORT=8101 BASE_PATH=/hire
EXPOSE 8101
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8101/healthz || exit 1
CMD ["node", "src/server.js"]

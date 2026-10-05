FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
COPY data ./data
COPY public ./public
# lệnh quản trị nhập gia đình hiện có sang 9id: docker exec -it 9family node scripts/export-to-9id.js
COPY scripts/export-to-9id.js ./scripts/export-to-9id.js
ENV NODE_ENV=production PORT=8096 BASE_PATH=/9family
EXPOSE 8096
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "src/server.js"]

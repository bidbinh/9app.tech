FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY sdk ./sdk
COPY db ./db
COPY data ./data
COPY public ./public
ENV NODE_ENV=production PORT=8103 BASE_PATH=
EXPOSE 8103
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8103/healthz || exit 1
CMD ["node", "src/server.js"]

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
COPY public ./public
ENV NODE_ENV=production PORT=8110 BASE_PATH=/stay DATA_DIR=/data
# thư mục ảnh phòng (volume): tạo sẵn và cấp cho người dùng node để volume mới thừa hưởng quyền
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8110
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8110/stay/healthz || exit 1
CMD ["node", "src/server.js"]

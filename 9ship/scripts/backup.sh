#!/bin/sh
# Sao lưu PostgreSQL của 9Ship (chạy trên máy chủ). Giữ 14 bản gần nhất. Ví dụ cron: 17 3 * * * /home/tms/9ship/scripts/backup.sh
set -e
DIR=${BACKUP_DIR:-/home/tms/9ship/backup}
mkdir -p "$DIR"
docker exec 9ship-db pg_dump -U ship -d ship | gzip > "$DIR/ship-$(date +%Y%m%d-%H%M%S).sql.gz"
ls -1t "$DIR"/ship-*.sql.gz | tail -n +15 | xargs -r rm -f

#!/usr/bin/env bash
# Đưa 9draw lên 9app.tech (app tĩnh). Chạy từ Git Bash:  bash deploy-draw/deploy.sh
# Làm: sao lưu apps.js + index.html trên máy chủ, chép draw/, icon, chỉ mục tìm, thêm ô vào launcher, kiểm sha256 và thử URL thật.
# Chạy lại nhiều lần vẫn an toàn (không thêm ô trùng).
set -euo pipefail
cd "$(dirname "$0")/.."

K="-i $HOME/.ssh/9log_deploy"
R=root@103.176.20.95
S=/home/tms/ops/certbot/www/9app
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== Kiểm tra trước khi chép"
(cd draw && node --test test/ >/dev/null) && echo "test đạt"
ssh $K $R "free -m | sed -n 2p; df -h / | tail -1; test -f $S/js/apps.js && echo 'launcher có trên máy chủ'"

echo "== Đóng gói"
tar -C draw -cf "$TMP/draw.tar" index.html manifest.webmanifest sw.js css js icons
cp deploy-draw/draw-icon.svg "$TMP/draw-icon.svg"
cp deploy-draw/draw-search.json "$TMP/draw-search.json"
cp deploy-draw/patch-launcher.py "$TMP/patch-launcher.py"

echo "== Sao lưu launcher trên máy chủ"
STAMP=$(date +%H%M)
ssh $K $R "mkdir -p $S/draw && cp -a $S/js/apps.js $S/js/apps.js.bak-draw-$STAMP && cp -a $S/index.html $S/index.html.bak-draw-$STAMP && echo 'đã sao lưu (.bak-draw-$STAMP)'"

echo "== Chép tệp"
scp $K -q "$TMP/draw.tar" "$TMP/draw-icon.svg" "$TMP/draw-search.json" "$TMP/patch-launcher.py" $R:/tmp/
ssh $K $R "tar -C $S/draw -xf /tmp/draw.tar && cp /tmp/draw-icon.svg $S/icons/draw.svg && cp /tmp/draw-search.json $S/search/draw.json && python3 /tmp/patch-launcher.py $S && rm -f /tmp/draw.tar /tmp/draw-icon.svg /tmp/draw-search.json /tmp/patch-launcher.py"

echo "== Kiểm sha256"
ssh $K $R "cd $S/draw && find . -type f | sed 's#^\./##' | sort | xargs sha256sum" > "$TMP/remote.sha"
(cd draw && find index.html manifest.webmanifest sw.js css js icons -type f | sort | xargs sha256sum) > "$TMP/local.sha"
diff <(sort -k2 "$TMP/local.sha") <(sort -k2 "$TMP/remote.sha") && echo "SHA khớp ($(wc -l < "$TMP/local.sha") tệp)"

echo "== Thử URL thật"
for u in draw/ draw/js/app.js draw/js/lib/engine.js draw/manifest.webmanifest icons/draw.svg search/draw.json; do
  printf '%s  ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' "https://9app.tech/$u"
done
curl -s "https://9app.tech/js/apps.js?x=$RANDOM" | grep -c "id: 'draw'" | sed 's/^/ô 9draw trong apps.js: /'
echo "Xong. Mở https://9app.tech/draw/ trên điện thoại, vẽ thử và bấm Xuất ảnh."
echo "Hoàn lại nếu cần:  ssh $K $R 'cd $S && cp js/apps.js.bak-draw-$STAMP js/apps.js && cp index.html.bak-draw-$STAMP index.html && rm -rf draw icons/draw.svg search/draw.json'"

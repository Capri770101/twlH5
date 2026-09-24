#!/bin/sh
set -eu
release=/root/twlh5-releases/v1.0.5-greeting-order-20260923
mkdir -p "$release"
for f in greetings.js diyPlans.js index.js orders.js merchantBridge.js token.js; do
  if [ -f "/opt/twlh5-api/src/$f" ]; then cp "/opt/twlh5-api/src/$f" "$release/$f.before.js"; fi
  cp "/tmp/$f" "/opt/twlh5-api/src/$f"
done
chown -R twlh5:twlh5 /opt/twlh5-api/src
systemctl restart twlh5-api
sleep 5
systemctl is-active twlh5-api
curl -fsS -o /dev/null -w 'api=%{http_code}\n' http://127.0.0.1:4000/health || true
echo "release=$release"

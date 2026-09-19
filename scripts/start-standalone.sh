#!/bin/sh
set -eu
# Shared by all workers, never logged or embedded in client assets.
if [ -z "${API_KEY:-}" ]; then
    API_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
    export API_KEY
fi
/usr/local/bin/generate-nginx-upstream.sh
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

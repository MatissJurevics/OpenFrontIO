#!/bin/sh
set -eu
# Coolify supplies SOURCE_COMMIT at runtime; plain Docker builds fall back to
# the deterministic gameplay hash, never a shared placeholder version.
GIT_COMMIT="${SOURCE_COMMIT:-$(cut -c1-40 /usr/src/app/static/core-version.txt)}"
export GIT_COMMIT
printf '%s\n' "$GIT_COMMIT" > /usr/src/app/static/commit.txt
# Shared by all workers, never logged or embedded in client assets.
if [ -z "${API_KEY:-}" ]; then
    API_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
    export API_KEY
fi
/usr/local/bin/generate-nginx-upstream.sh
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

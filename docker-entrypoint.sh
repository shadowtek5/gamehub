#!/bin/sh
# GameHub entrypoint: when started as root (the default), align the app user
# with PUID/PGID (for NAS hosts like Synology/unRAID where the mounted data
# folder belongs to a specific user), make /app/data writable, then drop
# privileges. When started with --user, just run as that user.
set -e

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  if [ "$(id -g node)" != "$PGID" ]; then
    groupmod -o -g "$PGID" node
  fi
  if [ "$(id -u node)" != "$PUID" ]; then
    usermod -o -u "$PUID" node
  fi

  mkdir -p /app/data
  if [ "$(stat -c '%u:%g' /app/data)" != "$PUID:$PGID" ]; then
    echo "gamehub: taking ownership of /app/data as $PUID:$PGID"
    chown -R "$PUID:$PGID" /app/data || true
  fi

  exec gosu node "$@"
fi

exec "$@"

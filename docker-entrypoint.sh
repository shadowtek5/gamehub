#!/bin/sh
# GameHub entrypoint.
#
# 1. Align the app user with PUID/PGID (NAS hosts) and make /app/data writable,
#    then drop privileges — as before.
# 2. Self-update: pick which build to run. A staged release under
#    /app/data/app/releases/<version> can override the image's baked-in build.
#    The image is always the fallback floor, so a bad update can never brick the
#    container:
#      - `current` names the version to boot ("image" or a <version>)
#      - `healthy` names the version last confirmed healthy at runtime
#      - `trials`  counts boot attempts since the last healthy confirmation;
#        after 3 the release is assumed crash-looping and we revert to
#        `rollback` (the previously-healthy build, or the image)
#    The running app confirms health (resets trials, sets `healthy`) once it has
#    stayed up for a grace period — see src/lib/update/background.ts.
set -e

APP_DATA="${GAMEHUB_DATA_DIR:-/app/data}"
APP_DIR="$APP_DATA/app"
IMAGE_SERVER="/app/server.js"

# Everything reads the data dir from this absolute env var, NOT process.cwd(),
# because Next's standalone server.js calls process.chdir(__dirname) and a
# staged release lives outside /app. See src/lib/dataDir.ts.
export GAMEHUB_DATA_DIR="$APP_DATA"
if [ -f /app/.image-version ]; then
  GAMEHUB_IMAGE_VERSION="$(cat /app/.image-version 2>/dev/null || true)"
  export GAMEHUB_IMAGE_VERSION
fi

# Decide which server.js to launch. Sets TARGET_SERVER and GAMEHUB_RELEASE.
select_release() {
  TARGET_SERVER="$IMAGE_SERVER"
  GAMEHUB_RELEASE="image"

  CUR="$(cat "$APP_DIR/current" 2>/dev/null || echo image)"
  [ -n "$CUR" ] || CUR="image"

  # If the Docker image was upgraded (docker compose pull) to a version newer
  # than the staged release, the image wins — a manual image update should never
  # be overridden by an older in-app update. Clear the stale pointer.
  IMG="${GAMEHUB_IMAGE_VERSION:-}"
  if [ "$CUR" != "image" ] && [ -n "$IMG" ] && [ "$IMG" != "$CUR" ]; then
    NEWER="$(printf '%s\n%s\n' "$CUR" "$IMG" | sort -V 2>/dev/null | tail -1)"
    if [ "$NEWER" = "$IMG" ]; then
      echo "gamehub: image $IMG is newer than staged $CUR — using the image" >&2
      echo image > "$APP_DIR/current" 2>/dev/null || true
      echo 0 > "$APP_DIR/trials" 2>/dev/null || true
      CUR="image"
    fi
  fi

  if [ "$CUR" != "image" ] && [ -f "$APP_DIR/releases/$CUR/server.js" ]; then
    HEALTHY="$(cat "$APP_DIR/healthy" 2>/dev/null || echo '')"
    if [ "$CUR" = "$HEALTHY" ]; then
      # known-good release
      echo 0 > "$APP_DIR/trials" 2>/dev/null || true
      TARGET_SERVER="$APP_DIR/releases/$CUR/server.js"
      GAMEHUB_RELEASE="$CUR"
    else
      TRIALS="$(cat "$APP_DIR/trials" 2>/dev/null || echo 0)"
      case "$TRIALS" in '' | *[!0-9]*) TRIALS=0 ;; esac
      if [ "$TRIALS" -ge 3 ]; then
        RB="$(cat "$APP_DIR/rollback" 2>/dev/null || echo image)"
        [ -n "$RB" ] || RB="image"
        echo "gamehub: release $CUR failed to become healthy after $TRIALS attempts — reverting to $RB" >&2
        echo "$RB" > "$APP_DIR/current" 2>/dev/null || true
        echo 0 > "$APP_DIR/trials" 2>/dev/null || true
        if [ "$RB" != "image" ] && [ -f "$APP_DIR/releases/$RB/server.js" ]; then
          TARGET_SERVER="$APP_DIR/releases/$RB/server.js"
          GAMEHUB_RELEASE="$RB"
        fi
      else
        echo $((TRIALS + 1)) > "$APP_DIR/trials" 2>/dev/null || true
        echo "gamehub: booting staged release $CUR (attempt $((TRIALS + 1))/3)" >&2
        TARGET_SERVER="$APP_DIR/releases/$CUR/server.js"
        GAMEHUB_RELEASE="$CUR"
      fi
    fi
  fi
  export GAMEHUB_RELEASE
}

# Only take over the default command (node server.js). Any other command
# (a shell, a one-off script) runs verbatim so the image stays debuggable.
IS_DEFAULT_CMD=0
if [ "$1" = "node" ] && [ "$2" = "server.js" ]; then IS_DEFAULT_CMD=1; fi

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"

  if [ "$(id -g node)" != "$PGID" ]; then
    groupmod -o -g "$PGID" node
  fi
  if [ "$(id -u node)" != "$PUID" ]; then
    usermod -o -u "$PUID" node
  fi

  mkdir -p "$APP_DATA" "$APP_DIR"
  if [ "$(stat -c '%u:%g' "$APP_DATA")" != "$PUID:$PGID" ]; then
    echo "gamehub: taking ownership of $APP_DATA as $PUID:$PGID"
    chown -R "$PUID:$PGID" "$APP_DATA" || true
  fi

  if [ "$IS_DEFAULT_CMD" = "1" ]; then
    select_release
    # markers may have just been (re)written as root — hand them back to the app
    chown "$PUID:$PGID" "$APP_DIR" "$APP_DIR"/current "$APP_DIR"/trials \
      "$APP_DIR"/rollback "$APP_DIR"/healthy 2>/dev/null || true
    exec gosu node node "$TARGET_SERVER"
  fi

  exec gosu node "$@"
fi

# Started with --user (already non-root): no PUID/PGID juggling.
if [ "$IS_DEFAULT_CMD" = "1" ]; then
  mkdir -p "$APP_DIR" 2>/dev/null || true
  select_release
  exec node "$TARGET_SERVER"
fi

exec "$@"

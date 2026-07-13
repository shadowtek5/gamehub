# GameHub — self-hosted retro game library
# Build:  docker build -t gamehub .
# Run:    see docker-compose.yml

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 is native; bookworm-slim matches its published prebuilds
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# gosu: start as root, fix /app/data ownership (PUID/PGID), drop privileges —
# required on NAS hosts (Synology/unRAID) where mounted folders belong to a
# specific user
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu passwd \
  && rm -rf /var/lib/apt/lists/*

# Standalone output carries its own node_modules (incl. better-sqlite3).
# Copy with --chown so the files land node-owned in a single layer — a separate
# `chown -R /app` would duplicate the whole 300MB+ tree into another layer.
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node docker-entrypoint.sh /docker-entrypoint.sh

# Everything GameHub writes lives under /app/data — mount a volume here.
# ROMs are read from wherever you mount them (e.g. /roms); GameHub never
# modifies them except explicit admin rename/delete/upload actions. Only the
# two dirs need chowning here (not -R); the entrypoint re-owns /app/data to
# PUID/PGID at runtime.
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh \
  && mkdir -p /app/data && chown node:node /app /app/data
VOLUME /app/data

EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/api/heartbeat').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]

# apps/services/user/Dockerfile
# =============================================================================
# Helix User Service — Cloudflare Worker Docker image
# -----------------------------------------------------------------------------
# Build context must be the repository root:
#
#   docker build -f apps/services/user/Dockerfile -t ghcr.io/sinless-games/helix-user-service:local .
#
# Run locally:
#
#   docker run --rm -p 3001:3000 \
#     --env-file apps/services/user/.dev.vars \
#     ghcr.io/sinless-games/helix-user-service:local
#
# Notes:
# - This service is authored as a Cloudflare Worker.
# - The runtime stage uses Wrangler's local Worker runtime so the container
#   exposes an HTTP listener.
# - For pure Node/Kubernetes runtime later, add a Node adapter entrypoint using
#   @hono/node-server and switch CMD to that file.
# =============================================================================

# -----------------------------------------------------------------------------
# Base image
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NX_DAEMON=false
ENV CI=true

# Avoid downloading Cypress binary inside service image builds.
ENV CYPRESS_INSTALL_BINARY=0

# Make pnpm more tolerant of slow package registry/network conditions.
ENV PNPM_CONFIG_FETCH_RETRIES=10
ENV PNPM_CONFIG_FETCH_RETRY_FACTOR=2
ENV PNPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV PNPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
ENV PNPM_CONFIG_FETCH_TIMEOUT=600000
ENV PNPM_CONFIG_NETWORK_CONCURRENCY=4
ENV PNPM_CONFIG_PREFER_OFFLINE=true

RUN corepack enable \
  && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
  && rm -rf /var/lib/apt/lists/*

COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./

COPY apps/services/user/package.json ./apps/services/user/package.json

COPY libs/api/package.json ./libs/api/package.json
COPY libs/config/package.json ./libs/config/package.json
COPY libs/contracts/package.json ./libs/contracts/package.json
COPY libs/db/package.json ./libs/db/package.json
COPY libs/flags/package.json ./libs/flags/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  set -eux; \
  pnpm config set store-dir /pnpm/store; \
  pnpm config set fetch-retries 10; \
  pnpm config set fetch-retry-factor 2; \
  pnpm config set fetch-retry-mintimeout 20000; \
  pnpm config set fetch-retry-maxtimeout 120000; \
  pnpm config set fetch-timeout 600000; \
  pnpm config set network-concurrency 4; \
  retry() { \
    attempt=1; \
    until "$@"; do \
      if [ "$attempt" -ge 5 ]; then \
        echo "Command failed after $attempt attempts: $*"; \
        return 1; \
      fi; \
      sleep_time=$((attempt * 30)); \
      echo "Command failed. Retrying in ${sleep_time}s... attempt ${attempt}/5"; \
      sleep "$sleep_time"; \
      attempt=$((attempt + 1)); \
    done; \
  }; \
  retry pnpm fetch --frozen-lockfile --reporter=append-only; \
  pnpm install --frozen-lockfile --offline --reporter=append-only

# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------
FROM base AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/services/user/node_modules ./apps/services/user/node_modules

COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./

COPY libs ./libs
COPY apps/services/user ./apps/services/user

RUN pnpm exec nx run user-service:build:production

# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NX_DAEMON=false
ENV CI=true
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home worker \
  && corepack enable \
  && corepack prepare pnpm@10.23.0 --activate

COPY --from=builder --chown=worker:nodejs /app/package.json ./package.json
COPY --from=builder --chown=worker:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=worker:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=worker:nodejs /app/nx.json ./nx.json
COPY --from=builder --chown=worker:nodejs /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder --chown=worker:nodejs /app/tsconfig.json ./tsconfig.json

COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/libs ./libs

COPY --from=builder --chown=worker:nodejs /app/apps/services/user ./apps/services/user
COPY --from=builder --chown=worker:nodejs /app/dist/apps/services/user ./dist/apps/services/user

USER worker

EXPOSE 3000

CMD ["pnpm", "exec", "wrangler", "dev", "--config", "apps/services/user/wrangler.toml", "--ip", "0.0.0.0", "--port", "3000", "--local"]
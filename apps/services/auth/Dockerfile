# apps/services/auth/Dockerfile
# =============================================================================
# Helix Auth Service — Docker image
# -----------------------------------------------------------------------------
# Build context must be the repository root:
#
#   docker build -f apps/services/auth/Dockerfile -t helix-auth:test .
#
# Runtime assumption:
#   pnpm exec nx run auth:build
#   emits a Node-runnable entry at:
#   dist/apps/services/auth/main.js
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
COPY apps/services/auth/package.json ./apps/services/auth/package.json
COPY libs ./libs

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
COPY --from=deps /app/apps/services/auth/node_modules ./apps/services/auth/node_modules
COPY --from=deps /app/libs ./libs

COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./
COPY apps/services/auth ./apps/services/auth

RUN pnpm exec nx run auth:build

# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home auth

COPY --from=builder --chown=auth:nodejs /app/package.json ./package.json
COPY --from=builder --chown=auth:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=auth:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=auth:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=auth:nodejs /app/libs ./libs

COPY --from=builder --chown=auth:nodejs /app/apps/services/auth/package.json ./apps/services/auth/package.json
COPY --from=builder --chown=auth:nodejs /app/apps/services/auth/node_modules ./apps/services/auth/node_modules
COPY --from=builder --chown=auth:nodejs /app/dist/apps/services/auth ./dist/apps/services/auth

USER auth

EXPOSE 3000

CMD ["node", "dist/apps/services/auth/main.js"]
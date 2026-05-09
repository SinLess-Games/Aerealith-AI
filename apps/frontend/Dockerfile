# apps/frontend/Dockerfile
# =============================================================================
# Helix AI Frontend — Next.js Docker image
# -----------------------------------------------------------------------------
# Build context must be the repository root:
#
#   docker build -f apps/frontend/Dockerfile -t ghcr.io/sinless-games/helix-frontend:local .
#
# This version does not require Next.js standalone output.
# It runs the built app with `next start`.
# =============================================================================

# -----------------------------------------------------------------------------
# Base image
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NX_DAEMON=false
ENV CI=true

# Avoid downloading Cypress binary inside production image builds.
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
COPY apps/frontend/package.json ./apps/frontend/package.json
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
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /app/libs ./libs

COPY .npmrc ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./
COPY apps/frontend ./apps/frontend

RUN pnpm exec nx run frontend:build

RUN rm -rf apps/frontend/.next/cache

# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libc6 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/libs ./libs

COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/package.json ./apps/frontend/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next ./apps/frontend/.next

USER nextjs

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "apps/frontend", "-p", "3000", "-H", "0.0.0.0"]
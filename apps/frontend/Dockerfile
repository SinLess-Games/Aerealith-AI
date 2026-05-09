# apps/frontend/Dockerfile
# =============================================================================
# Helix AI Frontend — Next.js standalone Docker image
# -----------------------------------------------------------------------------
# Build context must be the repository root:
#
#   docker build -f apps/frontend/Dockerfile -t ghcr.io/sinless-games/helix-frontend:local .
#
# This Dockerfile expects apps/frontend/next.config.js to use:
#
#   output: 'standalone'
#
# Next.js standalone output creates a minimal server.js runtime bundle, but public
# assets and .next/static still need to be copied into the runtime image.
# =============================================================================

# -----------------------------------------------------------------------------
# Base image
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NX_DAEMON=false
ENV CI=true

RUN corepack enable

WORKDIR /app

# -----------------------------------------------------------------------------
# Dependencies
# -----------------------------------------------------------------------------
FROM base AS deps

RUN apk add --no-cache libc6-compat

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY libs ./libs

RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------
FROM base AS builder

RUN apk add --no-cache libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY --from=deps /app/libs ./libs

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json eslint.config.mjs ./
COPY apps/frontend ./apps/frontend

RUN pnpm exec nx run frontend:build

# Normalize Next standalone output into a stable Docker copy location.
RUN set -eux; \
  mkdir -p /app/.docker/frontend; \
  if [ -d /app/apps/frontend/.next/standalone ]; then \
    cp -R /app/apps/frontend/.next/standalone/. /app/.docker/frontend/; \
  elif [ -d /app/dist/apps/frontend/.next/standalone ]; then \
    cp -R /app/dist/apps/frontend/.next/standalone/. /app/.docker/frontend/; \
  elif [ -d /app/dist/apps/frontend/standalone ]; then \
    cp -R /app/dist/apps/frontend/standalone/. /app/.docker/frontend/; \
  else \
    echo "Could not find Next standalone output."; \
    find /app -maxdepth 5 -type d \( -name standalone -o -name .next -o -name static \) | sort; \
    exit 1; \
  fi; \
  mkdir -p /app/.docker/frontend/apps/frontend/.next; \
  if [ -d /app/apps/frontend/.next/static ]; then \
    cp -R /app/apps/frontend/.next/static /app/.docker/frontend/apps/frontend/.next/static; \
  elif [ -d /app/dist/apps/frontend/.next/static ]; then \
    cp -R /app/dist/apps/frontend/.next/static /app/.docker/frontend/apps/frontend/.next/static; \
  elif [ -d /app/dist/apps/frontend/static ]; then \
    cp -R /app/dist/apps/frontend/static /app/.docker/frontend/apps/frontend/.next/static; \
  else \
    echo "Could not find Next static output."; \
    find /app -maxdepth 5 -type d \( -name standalone -o -name .next -o -name static \) | sort; \
    exit 1; \
  fi

# -----------------------------------------------------------------------------
# Runtime
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.docker/frontend ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
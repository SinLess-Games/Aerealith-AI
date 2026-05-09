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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json ./
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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json tsconfig.json ./
COPY apps/frontend ./apps/frontend

RUN pnpm exec nx run frontend:build

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

COPY --from=builder --chown=nextjs:nodejs /app/dist/apps/frontend/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/dist/apps/frontend/static ./apps/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public

USER nextjs

EXPOSE 3000

CMD ["node", "apps/frontend/server.js"]
# Helix User Service

Cloudflare Worker service for Helix AI user records, public profiles, and user settings.

## Service

| Item | Value |
| --- | --- |
| Package | `@aerealith-ai/user-service` |
| Nx project | `user-service` |
| Worker name | `helix-user-service` |
| Preview Worker | `helix-user-service-preview` |
| Runtime | Cloudflare Workers |
| Framework | Hono |
| API base path | `/api/V1/users` |

## Route Contract

```txt
GET    /api/V1/users/health
GET    /api/V1/users
POST   /api/V1/users
GET    /api/V1/users/:username
PATCH  /api/V1/users/:username
DELETE /api/V1/users/:username
GET    /api/V1/users/:username/profile
GET    /api/V1/users/:username/settings
````

## Service Communication

The frontend owns the public domain and calls this Worker through a Cloudflare Service Binding.

```txt
helix-ai-frontend
  -> USER_SERVICE
  -> helix-user-service
```

The user service can call auth internally through:

```txt
AUTH_SERVICE
  -> helix-auth-service
```

The user service should not expose its own production public route while the frontend Worker owns `helixaibot.com`.

## Directory Layout

```txt
apps/services/user
├── src
│   ├── app.ts
│   ├── index.ts
│   ├── main.ts
│   ├── health
│   │   ├── health.controller.ts
│   │   ├── health.router.ts
│   │   ├── health.service.ts
│   │   └── index.ts
│   ├── routes
│   │   ├── index.ts
│   │   └── v1.router.ts
│   └── users
│       ├── controllers
│       ├── guards
│       ├── mappers
│       ├── services
│       ├── types
│       ├── index.ts
│       └── users.router.ts
├── eslint.config.mjs
├── package.json
├── project.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.spec.json
├── vite.config.ts
├── vitest.config.ts
└── wrangler.toml
```

## Local Development

From the repo root:

```bash
pnpm nx serve user-service
```

Or run Wrangler directly:

```bash
pnpm exec wrangler dev --config apps/services/user/wrangler.toml
```

For multi-service local development with frontend and auth bindings:

```bash
pnpm exec wrangler dev \
  --config apps/frontend/wrangler.toml \
  --config apps/services/auth/wrangler.toml \
  --config apps/services/user/wrangler.toml
```

## Build

```bash
pnpm nx build user-service
```

Production build:

```bash
pnpm nx build user-service --configuration=production
```

## Test

```bash
pnpm nx test user-service
```

## Lint

```bash
pnpm nx lint user-service
```

## Full Verification

```bash
pnpm nx run-many -t lint test build
```

## Deploy

Preview:

```bash
pnpm exec wrangler deploy \
  --config apps/services/user/wrangler.toml \
  --env preview
```

Production:

```bash
pnpm exec wrangler deploy \
  --config apps/services/user/wrangler.toml \
  --env production
```

## Required Secrets

Do not store secrets in `wrangler.toml`.

Use `.dev.vars` locally and Wrangler secrets for deployed environments.

Expected database secret names:

```txt
POSTGRES_URL
DATABASE_URL
SUPABASE_DB_URL
```

At least one database connection variable must be available through the shared DB config.

## Non-Secret Runtime Variables

Configured in `wrangler.toml`:

```txt
NODE_ENV
SERVICE_NAME
SERVICE_DISPLAY_NAME
API_VERSION
API_BASE_PATH
LOG_LEVEL

AUTH_SERVICE_NAME
AUTH_SERVICE_BASE_PATH

FRONTEND_SERVICE_NAME
FRONTEND_ORIGIN

DATABASE_PROVIDER
DATABASE_SSL_ENABLED
DATABASE_SSL_MODE
DATABASE_SSL_REJECT_UNAUTHORIZED
DATABASE_POOL_MIN
DATABASE_POOL_MAX
DATABASE_APPLICATION_NAME

MIKRO_ORM_DEBUG
```

## Cloudflare Bindings

```toml
[[services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service"
```

The frontend should bind this service as:

```toml
[[services]]
binding = "USER_SERVICE"
service = "helix-user-service"
```

Preview:

```toml
[[env.preview.services]]
binding = "USER_SERVICE"
service = "helix-user-service-preview"
```

Production:

```toml
[[env.production.services]]
binding = "USER_SERVICE"
service = "helix-user-service"
```

## Shared Libraries Used

| Library               | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `@aerealith-ai/api`       | Hono helpers, params, validation, responses, middleware |
| `@aerealith-ai/contracts` | DTOs, schemas, route constants, error codes             |
| `@aerealith-ai/db`        | MikroORM entities, repositories, ORM helpers            |
| `@aerealith-ai/config`    | Runtime config, route registry, service registry        |

## Data Flow

```txt
Request
  -> apps/services/user/src/main.ts
  -> apps/services/user/src/app.ts
  -> apps/services/user/src/routes/v1.router.ts
  -> apps/services/user/src/users/users.router.ts
  -> controller
  -> service
  -> @aerealith-ai/db repository
  -> MikroORM
  -> Postgres
```

## Notes

Keep files small and feature-scoped.

Controllers should handle HTTP concerns only:

* request params
* request body parsing
* status codes
* response shape

Services should handle business logic:

* user lookup
* conflict checks
* not-found handling
* lifecycle rules

Repositories should stay in `@aerealith-ai/db` and handle database access only.

Contracts should stay framework-neutral. Do not export Hono handlers, Cloudflare bindings, database entities, or service implementations from `@aerealith-ai/contracts`.

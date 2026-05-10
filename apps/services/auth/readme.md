# Helix Auth Service

Helix Auth Service is the authentication and session-management Worker for Helix AI.

It owns user registration, login, username-scoped auth identity lookup, password flows, email verification, access/refresh token handling, and session revocation. The service is designed to run as a Cloudflare Worker and to be called privately by `helix-ai-frontend` through a Cloudflare Worker service binding.

## Service Identity

| Field | Value |
| --- | --- |
| Service name | `helix-auth-service` |
| Preview service name | `helix-auth-service-preview` |
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database access | MikroORM |
| Public base path | `/api/V1/auth` |
| Frontend caller | `helix-ai-frontend` |
| Frontend binding name | `AUTH_SERVICE` |

## Worker Integration

The frontend Worker should bind to this service using the auth Worker name:

```toml
[[services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service"
````

For preview:

```toml
[[env.preview.services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service-preview"
```

The frontend should use:

```text
AUTH_SERVICE_BASE_PATH=/api/V1/auth
```

The auth Worker should also use:

```text
API_BASE_PATH=/api/V1/auth
FRONTEND_SERVICE_NAME=helix-ai-frontend
FRONTEND_ORIGIN=https://helixaibot.com
```

## Source Layout

```text
apps/services/auth/src/
├── controllers/
│   └── auth.controller.ts
│
├── middleware/
│   ├── auth-context.middleware.ts
│   ├── optional-auth.middleware.ts
│   └── require-auth.middleware.ts
│
├── repositories/
│   ├── account.repository.ts
│   ├── session.repository.ts
│   ├── user.repository.ts
│   └── verification-token.repository.ts
│
├── routes/
│   ├── auth-email-verification.routes.ts
│   ├── auth-password.routes.ts
│   ├── auth-public.routes.ts
│   ├── auth-session.routes.ts
│   ├── auth-username.routes.ts
│   ├── auth.routes.ts
│   └── index.ts
│
├── services/
│   ├── auth.service.ts
│   ├── password.service.ts
│   ├── session.service.ts
│   ├── token.service.ts
│   └── verification-token.service.ts
│
├── shims/
│   └── unused-db-driver.ts
│
├── types/
│   ├── auth-context.type.ts
│   └── auth-token.type.ts
│
├── app.ts
└── main.ts
```

## Responsibility by Layer

### `routes/`

Route modules define the HTTP contract and request validation boundaries.

| File                                | Responsibility                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `auth-public.routes.ts`             | Public auth flows such as registration, login, refresh, and public auth actions. |
| `auth-username.routes.ts`           | Username-scoped identity lookup for authenticated users.                         |
| `auth-session.routes.ts`            | Session listing and session revocation.                                          |
| `auth-email-verification.routes.ts` | Email verification token creation and email verification.                        |
| `auth-password.routes.ts`           | Password change, password reset token creation, and password reset.              |
| `auth.routes.ts`                    | Combines auth route groups.                                                      |
| `index.ts`                          | Route exports.                                                                   |

### `middleware/`

Middleware initializes and enforces auth context.

| File                          | Responsibility                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `auth-context.middleware.ts`  | Parses bearer tokens, validates token claims, loads user/session state, and sets request auth context. |
| `optional-auth.middleware.ts` | Allows anonymous requests while still attaching auth context when credentials are present.             |
| `require-auth.middleware.ts`  | Rejects anonymous requests and enforces authenticated access.                                          |

### `services/`

Services contain business logic and orchestration.

| File                            | Responsibility                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| `auth.service.ts`               | Main authentication orchestration service.                                 |
| `password.service.ts`           | Password hashing and verification.                                         |
| `token.service.ts`              | Access, refresh, password reset, and email verification token handling.    |
| `session.service.ts`            | Session creation, lookup, refresh rotation, and revocation.                |
| `verification-token.service.ts` | Verification-token creation, hashing, lookup, consumption, and revocation. |

### `repositories/`

Repositories wrap MikroORM persistence and query details.

| File                               | Responsibility                                            |
| ---------------------------------- | --------------------------------------------------------- |
| `user.repository.ts`               | User, profile, and settings creation and lookup.          |
| `account.repository.ts`            | Credentials account creation and provider account lookup. |
| `session.repository.ts`            | User session persistence and revocation.                  |
| `verification-token.repository.ts` | Email verification and password reset token persistence.  |

### `types/`

Local service types.

| File                   | Responsibility                            |
| ---------------------- | ----------------------------------------- |
| `auth-context.type.ts` | Hono auth context types and helpers.      |
| `auth-token.type.ts`   | Token type, scope, and claim definitions. |

## Current Route Groups

The final API path is built from:

```text
/api/V1/auth + route path
```

### Public auth routes

Defined in:

```text
src/routes/auth-public.routes.ts
```

Expected responsibility:

```text
POST /api/V1/auth/register
POST /api/V1/auth/login
POST /api/V1/auth/refresh
POST /api/V1/auth/logout
```

### Username identity routes

Defined in:

```text
src/routes/auth-username.routes.ts
```

```text
GET /api/V1/auth/:username
```

### Session routes

Defined in:

```text
src/routes/auth-session.routes.ts
```

```text
GET    /api/V1/auth/:username/sessions
DELETE /api/V1/auth/:username/sessions/:sessionId
```

### Email verification routes

Defined in:

```text
src/routes/auth-email-verification.routes.ts
```

```text
POST /api/V1/auth/:username/email/verification-token
POST /api/V1/auth/:username/email/verify
```

### Password routes

Defined in:

```text
src/routes/auth-password.routes.ts
```

```text
PATCH /api/V1/auth/:username/password
POST  /api/V1/auth/password/reset-token
POST  /api/V1/auth/password/reset
```

## Auth Context Model

Requests are treated as one of two auth states:

| State         | Description                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Anonymous     | No valid bearer token was supplied.                                                                              |
| Authenticated | A valid access token was supplied, the user exists, the user is allowed, and the session is valid when required. |

Authenticated context includes:

```text
user
session
token
claims
```

The middleware rejects:

```text
Missing required auth context
Malformed bearer headers
Invalid access tokens
Disabled users
Locked users
Deleted users
Suspended users
Missing required active sessions
Session/user claim mismatches
Expired sessions
```

## Token Types

The service supports these logical token categories:

```text
access
refresh
email_verification
password_reset
```

Access tokens are used for request authentication.

Refresh tokens are used for session continuation and rotation.

Email verification tokens are used to prove ownership of an email address.

Password reset tokens are used for password reset flows.

## Session Behavior

Sessions are persisted with a refresh-token hash and expiration timestamp.

Session operations include:

```text
Create session
Find session by id
Find active session by id
Find active session by refresh token hash
Rotate refresh token
Touch last-seen timestamp
Revoke one session
Revoke all user sessions
Delete session
```

Revocation is represented by moving the session expiration timestamp into the past or to the revocation timestamp.

## Persistence Notes

Repositories should use MikroORM through the injected `EntityManager`.

Creation flows should follow:

```ts
const entity = em.create(Entity, data);

em.persist(entity);
await em.flush();
```

Update flows should generally load an entity, assign changes, then flush:

```ts
const entity = await em.findOne(Entity, where);

if (!entity) {
  return null;
}

em.assign(entity, updates);
await em.flush();

return entity;
```

Transactional flows should use:

```ts
await em.transactional(async (transactionalEm) => {
  // create/persist/flush related entities together
});
```

## Environment Variables

Non-secret values belong in `wrangler.toml`.

```text
NODE_ENV
SERVICE_NAME
SERVICE_DISPLAY_NAME
API_VERSION
API_BASE_PATH
LOG_LEVEL
FRONTEND_SERVICE_NAME
FRONTEND_ORIGIN
```

Secrets must not be committed.

Use Wrangler secrets for deployed environments:

```bash
pnpm exec wrangler secret put POSTGRES_URL --config apps/services/auth/wrangler.toml
pnpm exec wrangler secret put JWT_ACCESS_SECRET --config apps/services/auth/wrangler.toml
pnpm exec wrangler secret put JWT_REFRESH_SECRET --config apps/services/auth/wrangler.toml
pnpm exec wrangler secret put PASSWORD_PEPPER --config apps/services/auth/wrangler.toml
```

For local development, use:

```text
apps/services/auth/.dev.vars
```

Example local-only values:

```dotenv
POSTGRES_URL=postgresql://user:password@localhost:5432/helix
JWT_ACCESS_SECRET=local-access-secret
JWT_REFRESH_SECRET=local-refresh-secret
PASSWORD_PEPPER=local-password-pepper
```

## Cloudflare Worker Configuration

Primary config:

```text
apps/services/auth/wrangler.toml
```

Important config values:

```toml
name = "helix-auth-service"
main = "src/main.ts"
compatibility_flags = ["nodejs_compat"]

[vars]
API_BASE_PATH = "/api/V1/auth"
FRONTEND_SERVICE_NAME = "helix-ai-frontend"
FRONTEND_ORIGIN = "https://helixaibot.com"
```

Preview environment:

```toml
[env.preview]
name = "helix-auth-service-preview"
```

Production environment:

```toml
[env.production]
name = "helix-auth-service"
workers_dev = false
preview_urls = false
```

## Worker Service Binding From Frontend

The frontend Worker should include:

```toml
[[services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service"
```

Preview should include:

```toml
[[env.preview.services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service-preview"
```

Production should include:

```toml
[[env.production.services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service"
```

## Optional Database Driver Shims

This service uses PostgreSQL, but MikroORM and Knex may include optional loaders for other database dialects.

The Worker build aliases unused drivers to:

```text
src/shims/unused-db-driver.ts
```

Wrangler aliases:

```toml
[alias]
"mariadb/callback" = "./src/shims/unused-db-driver.ts"
"better-sqlite3" = "./src/shims/unused-db-driver.ts"
"libsql" = "./src/shims/unused-db-driver.ts"
```

## Development Commands

Run from the repository root.

### Install dependencies

```bash
pnpm install
```

### Format

```bash
pnpm nx format:write
```

### Lint

```bash
pnpm nx lint auth
```

### Test

```bash
pnpm nx test auth
```

### Build

```bash
pnpm nx build auth
```

### Run the Worker locally

```bash
pnpm exec wrangler dev --config apps/services/auth/wrangler.toml
```

### Run frontend and auth Worker together locally

```bash
pnpm exec wrangler dev \
  --config apps/frontend/wrangler.toml \
  --config apps/services/auth/wrangler.toml
```

## Deployment Commands

### Deploy default environment

```bash
pnpm exec wrangler deploy --config apps/services/auth/wrangler.toml
```

### Deploy preview

```bash
pnpm exec wrangler deploy \
  --config apps/services/auth/wrangler.toml \
  --env preview
```

### Deploy production

```bash
pnpm exec wrangler deploy \
  --config apps/services/auth/wrangler.toml \
  --env production
```

## Test Coverage

Primary test groups:

```text
src/app.spec.ts
src/middleware/auth-context.middleware.spec.ts
src/middleware/optional-auth.middleware.spec.ts
src/middleware/require-auth.middleware.spec.ts

src/routes/auth.routes.spec.ts
src/routes/auth-public.routes.spec.ts
src/routes/auth-username.routes.spec.ts
src/routes/auth-session.routes.spec.ts
src/routes/auth-email-verification.routes.spec.ts
src/routes/auth-password.routes.spec.ts

src/services/auth.service.spec.ts
src/services/password.service.spec.ts
src/services/session.service.spec.ts
src/services/token.service.spec.ts
src/services/verification-token.service.spec.ts

src/repositories/account.repository.spec.ts
src/repositories/session.repository.spec.ts
src/repositories/user.repository.spec.ts
src/repositories/verification-token.repository.spec.ts
```

## Testing Rules

Tests should verify behavior at the correct layer.

Route specs should assert:

```text
HTTP status
Response body shape
Validation errors
Auth middleware behavior
Service-call arguments
```

Service specs should assert:

```text
Business rules
Repository interactions
Token/session orchestration
Error handling
```

Repository specs should assert:

```text
Entity field mappings
Query shapes
Persistence calls
Null handling
Normalization
```

Middleware specs should assert:

```text
Bearer token parsing
Anonymous context
Authenticated context
Rejected auth states
Session/user claim matching
```

## Common Troubleshooting

### Frontend cannot call auth service

Check that the frontend Worker binding points to the correct service name:

```toml
[[services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service"
```

Also confirm:

```text
AUTH_SERVICE_BASE_PATH=/api/V1/auth
```

### Preview frontend cannot call preview auth

Check the preview binding:

```toml
[[env.preview.services]]
binding = "AUTH_SERVICE"
service = "helix-auth-service-preview"
```

### Worker build fails on optional database drivers

Confirm the shim exists:

```text
apps/services/auth/src/shims/unused-db-driver.ts
```

Confirm aliases are present:

```toml
[alias]
"mariadb/callback" = "./src/shims/unused-db-driver.ts"
"better-sqlite3" = "./src/shims/unused-db-driver.ts"
"libsql" = "./src/shims/unused-db-driver.ts"
```

### Tests fail because mock calls do not match

Vitest `toHaveBeenCalledWith` checks the exact recorded arguments.

When fixing repository specs, compare against the actual received call shape and update the expectation rather than guessing older entity fields.

### Password route tests return `400` before service mocks run

The route schema rejected the request before `AuthService` was called.

Check:

```text
currentPassword
newPassword
confirmPassword
token
username
email
```

For positive-path tests, use strong passwords and include confirmation fields when required.

### Auth middleware returns `401` for valid-looking tests

Check that the mock session has a future expiration date.

Use a future session fixture for valid-path tests:

```ts
const TEST_SESSION_EXPIRES_AT = new Date('2099-05-09T13:00:00.000Z');
```

Use a past session fixture only for expired-session tests:

```ts
const TEST_EXPIRED_SESSION_EXPIRES_AT = new Date('2020-01-01T00:00:00.000Z');
```

## Security Notes

Do not commit:

```text
DATABASE_URL
POSTGRES_URL
JWT secrets
OAuth secrets
Password pepper
API keys
Cloudflare API tokens
```

Auth responses should avoid leaking:

```text
Password hashes
Token hashes
Internal database IDs beyond intended public IDs
Secret references
Stack traces in production
```

Password reset and email verification responses should be safe to expose only where intended. In production, prefer returning a generic response for account discovery-sensitive flows.

## Production Checklist

Before production deployment:

```text
[ ] POSTGRES_URL is configured as a Wrangler secret.
[ ] JWT access secret is configured as a Wrangler secret.
[ ] JWT refresh secret is configured as a Wrangler secret.
[ ] Password pepper is configured as a Wrangler secret.
[ ] API_BASE_PATH is /api/V1/auth.
[ ] helix-ai-frontend has AUTH_SERVICE bound to helix-auth-service.
[ ] Preview frontend binds to helix-auth-service-preview.
[ ] Production workers_dev is false.
[ ] Production preview_urls is false.
[ ] Observability is enabled.
[ ] Tests pass.
[ ] Build passes.
[ ] Worker dry-run deploy succeeds.
```

## Recommended Validation Commands

```bash
pnpm nx format:write
pnpm nx lint auth
pnpm nx test auth
pnpm nx build auth
pnpm exec wrangler deploy --config apps/services/auth/wrangler.toml --dry-run
```

## Maintainer Notes

Keep route-level validation close to the route modules.

Keep persistence details inside repositories.

Keep auth orchestration inside `auth.service.ts`.

Keep token details inside `token.service.ts`.

Keep password hashing details inside `password.service.ts`.

Keep Worker-to-Worker integration details in Wrangler config, not hardcoded in services.

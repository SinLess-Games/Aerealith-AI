# @aerealith-ai/flags

Feature flag utilities for Aerealith AI.

This package wraps Cloudflare Flagship through OpenFeature and provides shared context builders, server-side evaluation helpers, browser/client helpers, Hono middleware, and SDK-neutral testing utilities.

## Purpose

`@aerealith-ai/flags` centralizes feature flag behavior across Aerealith AI so applications can evaluate flags consistently without coupling every app directly to Cloudflare Flagship or OpenFeature implementation details.

The package is designed around explicit runtime entrypoints:

```ts
import { buildFlagEvaluationContext } from '@aerealith-ai/flags';

import { initializeFlagshipServerProvider } from '@aerealith-ai/flags/server';

import { initializeFlagshipClientProvider } from '@aerealith-ai/flags/client';

import { honoFlagMiddleware } from '@aerealith-ai/flags/hono';

import { createMockFlagProvider } from '@aerealith-ai/flags/testing';
````

## Package entrypoints

| Entrypoint                    | Runtime                 | Purpose                                                       |
| ----------------------------- | ----------------------- | ------------------------------------------------------------- |
| `@aerealith-ai/flags`         | Shared                  | Runtime-neutral constants, types, and context builders        |
| `@aerealith-ai/flags/server`  | Server / Node / Workers | Async server-side provider setup and evaluation               |
| `@aerealith-ai/flags/client`  | Browser                 | Browser provider setup, prefetch helpers, and sync evaluation |
| `@aerealith-ai/flags/hono`    | Hono / Workers / Node   | Hono middleware and route helpers                             |
| `@aerealith-ai/flags/testing` | Tests                   | Mock registries, mock values, and SDK-neutral mock evaluators |

Do not import server, client, or Hono APIs from the root package. The root package should remain runtime-neutral.

## Installation

Inside the monorepo:

```bash
pnpm -F @aerealith-ai/flags add @cloudflare/flagship @openfeature/server-sdk @openfeature/web-sdk hono zod
```

Recommended package split:

```json
{
  "dependencies": {
    "@cloudflare/flagship": "^0.3.1",
    "hono": "^4.12.18",
    "zod": "^4.4.3"
  },
  "peerDependencies": {
    "@openfeature/server-sdk": "^1.21.0",
    "@openfeature/web-sdk": "^1.8.0"
  },
  "devDependencies": {
    "@openfeature/server-sdk": "^1.21.0",
    "@openfeature/web-sdk": "^1.8.0"
  }
}
```

## Environment variables

Server-side remote configuration:

```bash
CLOUDFLARE_FLAGSHIP_APP_ID="..."
CLOUDFLARE_ACCOUNT_ID="..."
CLOUDFLARE_FLAGSHIP_AUTH_TOKEN="..."
AEREALITH_ENVIRONMENT="development"
AEREALITH_FLAGS_PROVIDER_NAME="aerealith-flagship"
```

Cloudflare Workers should prefer a Flagship binding named:

```txt
FLAGS
```

Example Worker binding usage:

```ts
await initializeFlagshipServerProvider({
  binding: env.FLAGS,
});
```

## Important security note

Do not expose powerful Cloudflare API tokens in public browser bundles unless the token has been intentionally created for that use case and the risk is accepted.

The browser/client provider requires an API token because it fetches flag values from the browser. Keep browser prefetch usage limited to flags that are safe for public clients.

For sensitive authorization, billing, admin, or entitlement checks, evaluate flags on the server.

## Flag naming

Use stable kebab-case or simple lowercase keys.

Recommended first-pass boolean flags:

| Flag key           | Type    | Default | Purpose                               |
| ------------------ | ------- | ------: | ------------------------------------- |
| `authentication`   | Boolean |  `true` | Enables authentication flows          |
| `registration`     | Boolean | `false` | Enables new account registration      |
| `billing`          | Boolean | `false` | Enables billing features              |
| `pricing`          | Boolean |  `true` | Enables pricing UI                    |
| `dashboard`        | Boolean |  `true` | Enables dashboard access              |
| `onboarding`       | Boolean |  `true` | Enables onboarding flows              |
| `observability`    | Boolean | `false` | Enables observability-facing features |
| `maintenance-mode` | Boolean | `false` | Enables maintenance mode              |

Recommended boolean variations in Flagship:

```txt
on  -> true
off -> false
```

For structured configuration, use separate object flags:

```txt
pricing-config
onboarding-config
observability-config
```

Example object flag value:

```json
{
  "enabled": true,
  "mode": "beta",
  "allowedPlans": ["premium", "pro", "enterprise"]
}
```

## Evaluation context

Feature flag targeting should use a stable `targetingKey`.

Preferred context order:

1. `targetingKey`
2. `userId`
3. `anonymousId`
4. `sessionId`

Example:

```ts
import { buildUserFlagEvaluationContext } from '@aerealith-ai/flags';

const context = buildUserFlagEvaluationContext({
  id: 'user-42',
  plan: 'enterprise',
  country: 'US',
  locale: 'en-US',
});
```

Resulting context includes a stable targeting key:

```ts
{
  targetingKey: 'user:user-42',
  userId: 'user-42',
  plan: 'enterprise',
  country: 'US',
  locale: 'en-US',
  authenticated: true
}
```

Avoid putting unnecessary sensitive information into flag context. Only include attributes that are needed for targeting rules.

## Server usage

Use `@aerealith-ai/flags/server` in Node.js, Cloudflare Workers, API routes, backend services, and server-side rendering environments.

### Initialize with remote credentials

```ts
import {
  initializeFlagshipServerProvider,
  evaluateServerBooleanFlag,
} from '@aerealith-ai/flags/server';

await initializeFlagshipServerProvider({
  appId: process.env.CLOUDFLARE_FLAGSHIP_APP_ID!,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  authToken: process.env.CLOUDFLARE_FLAGSHIP_AUTH_TOKEN!,
});

const enabled = await evaluateServerBooleanFlag('dashboard', false, {
  context: {
    targetingKey: 'user:42',
    plan: 'enterprise',
  },
});
```

### Initialize with a Cloudflare Worker binding

```ts
import {
  initializeFlagshipServerProvider,
  evaluateServerBooleanFlag,
} from '@aerealith-ai/flags/server';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await initializeFlagshipServerProvider({
      binding: env.FLAGS,
    });

    const enabled = await evaluateServerBooleanFlag('dashboard', false, {
      context: {
        targetingKey: 'user:42',
        plan: 'enterprise',
      },
    });

    return Response.json({ enabled });
  },
};
```

### Create a server evaluator

```ts
import {
  initializeFlagshipServerProvider,
  createFlagshipServerEvaluator,
} from '@aerealith-ai/flags/server';

await initializeFlagshipServerProvider({
  appId: process.env.CLOUDFLARE_FLAGSHIP_APP_ID!,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  authToken: process.env.CLOUDFLARE_FLAGSHIP_AUTH_TOKEN!,
});

const flags = createFlagshipServerEvaluator({
  context: {
    targetingKey: 'user:42',
    plan: 'pro',
  },
});

const dashboardEnabled = await flags.boolean('dashboard', false);
const dashboardVariant = await flags.string('dashboard-variant', 'default');
const maxUploads = await flags.number('max-uploads', 10);
```

## Client usage

Use `@aerealith-ai/flags/client` only in browser/client-side code.

The client provider requires `prefetchFlags`. Only flags listed in `prefetchFlags` can be evaluated synchronously in the browser.

```ts
import {
  initializeFlagshipClientProvider,
  evaluateClientBooleanFlag,
} from '@aerealith-ai/flags/client';

await initializeFlagshipClientProvider({
  appId: import.meta.env.VITE_CLOUDFLARE_FLAGSHIP_APP_ID,
  accountId: import.meta.env.VITE_CLOUDFLARE_ACCOUNT_ID,
  authToken: import.meta.env.VITE_CLOUDFLARE_FLAGSHIP_AUTH_TOKEN,
  prefetchFlags: ['dashboard', 'pricing', 'onboarding'],
  context: {
    targetingKey: 'user:42',
    plan: 'pro',
  },
});

const dashboard = evaluateClientBooleanFlag('dashboard', false);
```

Client evaluations are synchronous after initialization:

```ts
const enabled = evaluateClientBooleanFlag('pricing', true).value;
```

Changing client context:

```ts
import { setFlagshipClientContext } from '@aerealith-ai/flags/client';

await setFlagshipClientContext({
  targetingKey: 'user:99',
  plan: 'enterprise',
});
```

When the browser context changes, prefetched flags are refreshed for the new context.

## Hono usage

Use `@aerealith-ai/flags/hono` for Hono APIs and Cloudflare Worker routes.

```ts
import { Hono } from 'hono';

import {
  honoFlagMiddleware,
  flagEnabled,
} from '@aerealith-ai/flags/hono';

type Env = {
  Bindings: {
    FLAGS: unknown;
    AEREALITH_ENVIRONMENT?: string;
  };
};

const app = new Hono<Env>();

app.use(
  '*',
  honoFlagMiddleware({
    includeAnonymousContext: true,
    failOpen: true,
  }),
);

app.get('/dashboard', async (c) => {
  const enabled = await flagEnabled(c, 'dashboard');

  if (!enabled) {
    return c.json({ error: 'Dashboard is disabled.' }, 404);
  }

  return c.json({ ok: true });
});

export default app;
```

### Hono request context

The middleware stores:

```ts
c.set('flags', evaluator);
c.set('flagContext', evaluationContext);
```

Route helpers read those values:

```ts
const enabled = await flagEnabled(c, 'billing');
const variant = await flagString(c, 'dashboard-variant', 'default');
const maxUploads = await flagNumber(c, 'max-uploads', 10);
```

### Custom Hono context

```ts
app.use(
  '*',
  honoFlagMiddleware({
    includeAnonymousContext: true,
    getContext: async (_input, c) => {
      const user = c.get('user');

      return {
        userId: user?.id,
        targetingKey: user?.id ? `user:${user.id}` : undefined,
        plan: user?.plan,
        role: user?.role,
      };
    },
  }),
);
```

## Testing usage

Use `@aerealith-ai/flags/testing` for unit tests without registering a real OpenFeature provider.

```ts
import {
  createMockFlagProvider,
  MOCK_BETA_USER_VALUES,
} from '@aerealith-ai/flags/testing';

const provider = createMockFlagProvider({
  values: MOCK_BETA_USER_VALUES,
  context: {
    targetingKey: 'user:42',
    plan: 'beta',
  },
});

const flags = provider.createServerEvaluator();

const enabled = await flags.boolean('observability', false);
```

Client-style mock evaluator:

```ts
import { createMockClientFlagEvaluator } from '@aerealith-ai/flags/testing';

const flags = createMockClientFlagEvaluator();

const dashboard = flags.boolean('dashboard', false);
```

Contextual resolver example:

```ts
import {
  createMockFlagProvider,
  createPlanMockResolver,
} from '@aerealith-ai/flags/testing';

const provider = createMockFlagProvider({
  resolvers: {
    'billing': createPlanMockResolver({
      fallback: false,
      values: {
        pro: true,
        enterprise: true,
      },
    }),
  },
  context: {
    targetingKey: 'user:42',
    plan: 'enterprise',
  },
});

const flags = provider.createServerEvaluator();

const billingEnabled = await flags.boolean('billing', false);
```

## Recommended file layout

```txt
libs/flags/
├── package.json
├── project.json
├── tsconfig.json
├── tsconfig.lib.json
├── README.md
└── src/
    ├── index.ts
    ├── types.ts
    ├── constants.ts
    ├── context/
    │   ├── index.ts
    │   ├── evaluation-context.ts
    │   └── user-context.ts
    ├── server/
    │   ├── index.ts
    │   ├── provider.ts
    │   ├── client.ts
    │   ├── evaluate.ts
    │   └── hooks.ts
    ├── client/
    │   ├── index.ts
    │   ├── provider.ts
    │   ├── client.ts
    │   ├── evaluate.ts
    │   └── prefetch.ts
    ├── hono/
    │   ├── index.ts
    │   ├── middleware.ts
    │   ├── context.ts
    │   └── helpers.ts
    └── testing/
        ├── index.ts
        ├── mock-provider.ts
        └── mock-flags.ts
```

## Build

```bash
pnpm nx build @aerealith-ai/flags
```

Or directly:

```bash
pnpm -F @aerealith-ai/flags build
```

## Typecheck

```bash
pnpm nx typecheck @aerealith-ai/flags
```

## Package exports

Recommended `package.json` exports:

```json
{
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server/index.d.ts",
      "import": "./dist/server/index.js",
      "default": "./dist/server/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "import": "./dist/client/index.js",
      "default": "./dist/client/index.js"
    },
    "./hono": {
      "types": "./dist/hono/index.d.ts",
      "import": "./dist/hono/index.js",
      "default": "./dist/hono/index.js"
    },
    "./testing": {
      "types": "./dist/testing/index.d.ts",
      "import": "./dist/testing/index.js",
      "default": "./dist/testing/index.js"
    }
  }
}
```

## Development notes

### Root entrypoint

The root entrypoint must stay runtime-neutral.

Allowed:

```ts
export * from './constants';
export * from './context';
export type * from './types';
```

Avoid:

```ts
export * from './server';
export * from './client';
export * from './hono';
```

Runtime-specific exports should remain in runtime-specific subpaths.

### Server entrypoint

The server entrypoint may import:

```ts
@openfeature/server-sdk
@cloudflare/flagship/server
@cloudflare/flagship
```

### Client entrypoint

The client entrypoint may import:

```ts
@openfeature/web-sdk
@cloudflare/flagship
```

### Hono entrypoint

The Hono entrypoint may import:

```ts
hono
hono/factory
@aerealith-ai/flags/server
```

### Testing entrypoint

The testing entrypoint should not import:

```ts
@openfeature/server-sdk
@openfeature/web-sdk
@cloudflare/flagship
hono
```

Keep testing utilities SDK-neutral unless creating explicit integration-test helpers.

## Flag creation checklist

When creating a flag in Cloudflare Flagship:

1. Create the flag key.
2. Choose the correct value type.
3. Add safe default variations.
4. Configure targeting rules.
5. Confirm the fallback/default behavior.
6. Add the key to the typed registry if it is used in code.
7. Add the key to `prefetchFlags` if used in browser code.
8. Add mock values for unit tests.
9. Document the owner and intended removal date if temporary.

## Recommended flag categories

### Boolean rollout flags

Use for kill switches, access gates, and gradual rollouts.

Examples:

```txt
dashboard
billing
registration
maintenance-mode
```

### String experiment flags

Use for named UI variants or flow variants.

Examples:

```txt
dashboard-variant
onboarding-variant
pricing-layout
```

### Number limit flags

Use for limits and thresholds.

Examples:

```txt
max-projects
max-uploads
rate-limit-multiplier
```

### Object config flags

Use for structured UI or product behavior.

Examples:

```txt
pricing-config
onboarding-config
observability-config
```

## Safety rules

Do not use client-side flags for hard authorization.

Bad:

```ts
if (evaluateClientBooleanFlag('admin-panel', false).value) {
  showAdminPanel();
}
```

Better:

```ts
const allowed = await evaluateServerBooleanFlag('admin-panel', false, {
  context: serverVerifiedUserContext,
});
```

Client-side flags are useful for UI presentation. Server-side checks are required for access control, billing, permissions, and privileged workflows.

## Naming conventions

Use:

```txt
dashboard
billing
maintenance-mode
dashboard-variant
pricing-config
max-uploads
```

Avoid:

```txt
DashboardEnabled
enable_new_dashboard_for_enterprise_users
flag1
test
```

## Common imports

Shared:

```ts
import {
  buildFlagEvaluationContext,
  buildUserFlagEvaluationContext,
  FLAGS_COMMON_KEYS,
} from '@aerealith-ai/flags';
```

Server:

```ts
import {
  initializeFlagshipServerProvider,
  evaluateServerBooleanFlag,
} from '@aerealith-ai/flags/server';
```

Client:

```ts
import {
  initializeFlagshipClientProvider,
  evaluateClientBooleanFlag,
} from '@aerealith-ai/flags/client';
```

Hono:

```ts
import {
  honoFlagMiddleware,
  flagEnabled,
} from '@aerealith-ai/flags/hono';
```

Testing:

```ts
import {
  createMockFlagProvider,
  MOCK_FLAG_VALUES,
} from '@aerealith-ai/flags/testing';
```

## Current status

This package is an internal Aerealith AI feature flag abstraction.

It is intended to support:

* Cloudflare Workers
* Node.js services
* Hono APIs
* Browser applications
* Unit tests
* Future React helpers
* Future typed flag registries
* Future observability integration

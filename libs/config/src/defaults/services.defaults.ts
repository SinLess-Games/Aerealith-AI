import type { ServicesConfig } from '../types/services';

export const defaultServicesConfig = {
  enabled: false,

  defaultTimeoutMs: 10_000,

  defaultRetry: {
    enabled: false,
    attempts: 0,
    initialDelayMs: 250,
    maxDelayMs: 2_000,
    backoffMultiplier: 2,
  },

  registry: {},
} satisfies ServicesConfig;

export const defaultCloudflareServicesConfig = {
  enabled: true,

  defaultTimeoutMs: 10_000,

  defaultRetry: {
    enabled: true,
    attempts: 3,
    initialDelayMs: 250,
    maxDelayMs: 2_000,
    backoffMultiplier: 2,
  },

  registry: {
    frontend: {
      name: 'frontend',
      displayName: 'Helix AI Frontend',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'Primary Helix AI web application served from helixaibot.com.',
      exposure: 'public',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'https',
          url: 'https://helixaibot.com',
          basePath: '/',
          healthPath: '/api/health',
          timeoutMs: 10_000,
          exposure: 'public',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      cloudflareBinding: {
        binding: 'WORKER_SELF_REFERENCE',
        service: 'helix-ai-frontend',
        entrypoint: undefined,
        rpcEnabled: false,
      },

      dependencies: [
        {
          service: 'auth',
          required: true,
          protocol: 'worker-binding',
          binding: 'AUTH_SERVICE',
          purpose: 'Route frontend auth requests to the internal auth Worker.',
        },
        {
          service: 'users',
          required: true,
          protocol: 'worker-binding',
          binding: 'USER_SERVICE',
          purpose: 'Route frontend user requests to the internal user Worker.',
        },
      ],

      retry: {
        enabled: true,
        attempts: 3,
        initialDelayMs: 250,
        maxDelayMs: 2_000,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: true,
        limit: 300,
        windowSeconds: 60,
        keyBy: 'ip',
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['frontend', 'web', 'cloudflare', 'public'],
      metadata: {
        domain: 'helixaibot.com',
      },
    },

    'api-gateway': {
      name: 'api-gateway',
      displayName: 'Helix API Gateway',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'Internal API gateway for Helix AI services, used by the frontend and public API routes.',
      exposure: 'internal',

      endpoints: {
        health: {
          name: 'health',
          protocol: 'https',
          url: 'https://helixaibot.com/api/health',
          basePath: '/api',
          healthPath: '/health',
          timeoutMs: 5_000,
          exposure: 'public',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      cloudflareBinding: {
        binding: 'API_GATEWAY_SERVICE',
        service: 'helix-api-gateway',
        entrypoint: 'ApiGatewayService',
        rpcEnabled: true,
      },

      queues: {
        events: {
          name: 'events',
          binding: 'HELIX_EVENTS_QUEUE',
          queue: 'helix-events',
          eventTypes: [
            'user.created',
            'user.updated',
            'assistant.message.created',
            'automation.requested',
            'audit.event.created',
          ],
          consumes: false,
          publishes: true,
        },
      },

      dependencies: [
        {
          service: 'auth',
          required: true,
          protocol: 'worker-binding',
          binding: 'AUTH_SERVICE',
          purpose: 'Authenticate requests and resolve user/session context.',
        },
        {
          service: 'users',
          required: true,
          protocol: 'worker-binding',
          binding: 'USER_SERVICE',
          purpose: 'Read and update user profile/account data.',
        },
        {
          service: 'events',
          required: true,
          protocol: 'queue',
          binding: 'HELIX_EVENTS_QUEUE',
          purpose: 'Publish async domain events.',
        },
      ],

      retry: {
        enabled: true,
        attempts: 3,
        initialDelayMs: 250,
        maxDelayMs: 2_000,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: true,
        limit: 600,
        windowSeconds: 60,
        keyBy: 'ip',
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['api', 'gateway', 'cloudflare', 'edge'],
      metadata: {
        serviceType: 'gateway',
      },
    },

    auth: {
      name: 'auth',
      displayName: 'Helix Auth Service',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'Authentication, session, OAuth, and authorization boundary service.',
      exposure: 'internal',

      endpoints: {
        internal: {
          name: 'internal',
          protocol: 'worker-binding',
          basePath: '/api/V1/auth',
          healthPath: '/api/V1/auth/health',
          timeoutMs: 5_000,
          exposure: 'internal',
          headers: {},
          requiredSecretRefs: [],
        },
        health: {
          name: 'health',
          protocol: 'worker-binding',
          basePath: '/api/V1/auth',
          healthPath: '/api/V1/auth/health',
          timeoutMs: 5_000,
          exposure: 'internal',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      cloudflareBinding: {
        binding: 'AUTH_SERVICE',
        service: 'helix-auth-service',
        entrypoint: 'AuthService',
        rpcEnabled: true,
      },

      dependencies: [
        {
          service: 'users',
          required: true,
          protocol: 'worker-binding',
          binding: 'USER_SERVICE',
          purpose:
            'Create, resolve, and synchronize user records during authentication.',
        },
      ],

      retry: {
        enabled: true,
        attempts: 2,
        initialDelayMs: 250,
        maxDelayMs: 1_500,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: true,
        limit: 120,
        windowSeconds: 60,
        keyBy: 'ip',
      },

      requiredConfigKeys: ['auth', 'database'],
      requiredSecretRefs: [
        'AUTH_SECRET',
        'POSTGRES_URL',
        'GOOGLE_CLIENT_SECRET',
        'GITHUB_CLIENT_SECRET',
        'DISCORD_CLIENT_SECRET',
      ],
      tags: ['auth', 'security', 'cloudflare', 'internal'],
      metadata: {
        serviceType: 'security',
      },
    },

    users: {
      name: 'users',
      displayName: 'Helix User Service',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'User profile, account, identity, plan, and preferences service.',
      exposure: 'internal',

      endpoints: {
        internal: {
          name: 'internal',
          protocol: 'worker-binding',
          basePath: '/api/V1/users',
          healthPath: '/api/V1/users/health',
          timeoutMs: 5_000,
          exposure: 'internal',
          headers: {},
          requiredSecretRefs: [],
        },
        health: {
          name: 'health',
          protocol: 'worker-binding',
          basePath: '/api/V1/users',
          healthPath: '/api/V1/users/health',
          timeoutMs: 5_000,
          exposure: 'internal',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      cloudflareBinding: {
        binding: 'USER_SERVICE',
        service: 'helix-user-service',
        entrypoint: 'UserService',
        rpcEnabled: true,
      },

      dependencies: [
        {
          service: 'auth',
          required: true,
          protocol: 'worker-binding',
          binding: 'AUTH_SERVICE',
          purpose:
            'Validate authenticated session and ownership checks for user routes.',
        },
        {
          service: 'events',
          required: false,
          protocol: 'queue',
          binding: 'HELIX_EVENTS_QUEUE',
          purpose: 'Publish user lifecycle events.',
        },
      ],

      retry: {
        enabled: true,
        attempts: 2,
        initialDelayMs: 250,
        maxDelayMs: 1_500,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: ['database'],
      requiredSecretRefs: ['POSTGRES_URL'],
      tags: ['users', 'identity', 'cloudflare', 'internal'],
      metadata: {
        serviceType: 'domain',
      },
    },

    events: {
      name: 'events',
      displayName: 'Helix Events Service',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'Async event ingestion and processing service backed by Cloudflare Queues.',
      exposure: 'internal',

      endpoints: {
        internal: {
          name: 'internal',
          protocol: 'queue',
          timeoutMs: 30_000,
          exposure: 'internal',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      queues: {
        events: {
          name: 'events',
          binding: 'HELIX_EVENTS_QUEUE',
          queue: 'helix-events',
          eventTypes: [
            'user.created',
            'user.updated',
            'assistant.message.created',
            'automation.requested',
            'audit.event.created',
          ],
          consumes: true,
          publishes: true,
        },
      },

      dependencies: [],

      retry: {
        enabled: true,
        attempts: 5,
        initialDelayMs: 500,
        maxDelayMs: 10_000,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['events', 'queue', 'cloudflare', 'internal'],
      metadata: {
        serviceType: 'async',
      },
    },

    discord: {
      name: 'discord',
      displayName: 'Helix Discord Bot Service',
      enabled: true,
      runtime: 'cloudflare-worker',
      version: undefined,
      environment: 'production',
      owner: 'SinLess Games LLC',
      description:
        'Discord interactions endpoint, bot command handling, and Discord event bridge.',
      exposure: 'public',

      endpoints: {
        interactions: {
          name: 'interactions',
          protocol: 'https',
          url: 'https://helixaibot.com/api/discord/interactions',
          basePath: '/api/discord',
          healthPath: '/health',
          timeoutMs: 3_000,
          exposure: 'public',
          headers: {},
          requiredSecretRefs: ['DISCORD_PUBLIC_KEY'],
        },
      },

      queues: {
        events: {
          name: 'events',
          binding: 'HELIX_EVENTS_QUEUE',
          queue: 'helix-events',
          eventTypes: [
            'discord.interaction.received',
            'discord.command.executed',
            'discord.webhook.received',
          ],
          consumes: false,
          publishes: true,
        },
      },

      dependencies: [
        {
          service: 'api-gateway',
          required: false,
          protocol: 'worker-binding',
          binding: 'API_GATEWAY_SERVICE',
          purpose:
            'Call shared API workflows when Discord commands need app data.',
        },
        {
          service: 'events',
          required: true,
          protocol: 'queue',
          binding: 'HELIX_EVENTS_QUEUE',
          purpose: 'Publish Discord bot events for async processing.',
        },
      ],

      retry: {
        enabled: true,
        attempts: 2,
        initialDelayMs: 250,
        maxDelayMs: 1_500,
        backoffMultiplier: 2,
      },

      rateLimit: {
        enabled: true,
        limit: 120,
        windowSeconds: 60,
        keyBy: 'ip',
      },

      requiredConfigKeys: ['discord'],
      requiredSecretRefs: ['DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY'],
      tags: ['discord', 'bot', 'webhook', 'cloudflare'],
      metadata: {
        serviceType: 'integration',
      },
    },
  },
} satisfies ServicesConfig;

export const defaultLocalServicesConfig = {
  enabled: true,

  defaultTimeoutMs: 10_000,

  defaultRetry: {
    enabled: false,
    attempts: 0,
    initialDelayMs: 250,
    maxDelayMs: 2_000,
    backoffMultiplier: 2,
  },

  registry: {
    frontend: {
      name: 'frontend',
      displayName: 'Helix AI Frontend',
      enabled: true,
      runtime: 'node',
      version: undefined,
      environment: 'development',
      owner: 'SinLess Games LLC',
      description: 'Local development frontend.',
      exposure: 'public',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'http',
          url: 'http://localhost:3000',
          basePath: '/',
          healthPath: '/api/health',
          timeoutMs: 10_000,
          exposure: 'public',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      dependencies: [
        {
          service: 'auth',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose: 'Call the local auth service during development.',
        },
        {
          service: 'users',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose: 'Call the local user service during development.',
        },
      ],

      retry: {
        enabled: false,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['frontend', 'web', 'local'],
      metadata: {
        domain: 'localhost',
      },
    },

    'api-gateway': {
      name: 'api-gateway',
      displayName: 'Helix Local API Gateway',
      enabled: true,
      runtime: 'node',
      version: undefined,
      environment: 'development',
      owner: 'SinLess Games LLC',
      description: 'Local development API gateway.',
      exposure: 'private',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'http',
          url: 'http://localhost:8787',
          basePath: '/api',
          healthPath: '/health',
          timeoutMs: 10_000,
          exposure: 'private',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      dependencies: [
        {
          service: 'auth',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose: 'Call the local auth service during development.',
        },
        {
          service: 'users',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose: 'Call the local user service during development.',
        },
      ],

      retry: {
        enabled: false,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['api', 'gateway', 'local'],
      metadata: {
        serviceType: 'gateway',
      },
    },

    auth: {
      name: 'auth',
      displayName: 'Helix Local Auth Service',
      enabled: true,
      runtime: 'node',
      version: undefined,
      environment: 'development',
      owner: 'SinLess Games LLC',
      description: 'Local development auth service.',
      exposure: 'private',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'http',
          url: 'http://localhost:8787',
          basePath: '/api/V1/auth',
          healthPath: '/api/V1/auth/health',
          timeoutMs: 10_000,
          exposure: 'private',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      dependencies: [
        {
          service: 'users',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose:
            'Create, resolve, and synchronize user records during local auth development.',
        },
      ],

      retry: {
        enabled: false,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: ['auth', 'database'],
      requiredSecretRefs: ['POSTGRES_URL'],
      tags: ['auth', 'security', 'local'],
      metadata: {
        serviceType: 'security',
      },
    },

    users: {
      name: 'users',
      displayName: 'Helix Local User Service',
      enabled: true,
      runtime: 'node',
      version: undefined,
      environment: 'development',
      owner: 'SinLess Games LLC',
      description: 'Local development user service.',
      exposure: 'private',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'http',
          url: 'http://localhost:8788',
          basePath: '/api/V1/users',
          healthPath: '/api/V1/users/health',
          timeoutMs: 10_000,
          exposure: 'private',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      dependencies: [
        {
          service: 'auth',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose:
            'Validate authenticated session and ownership checks during local development.',
        },
      ],

      retry: {
        enabled: false,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: ['database'],
      requiredSecretRefs: ['POSTGRES_URL'],
      tags: ['users', 'identity', 'local'],
      metadata: {
        serviceType: 'domain',
      },
    },

    events: {
      name: 'events',
      displayName: 'Helix Local Events Service',
      enabled: false,
      runtime: 'node',
      version: undefined,
      environment: 'development',
      owner: 'SinLess Games LLC',
      description: 'Local development event service placeholder.',
      exposure: 'private',

      endpoints: {
        public: {
          name: 'public',
          protocol: 'http',
          url: 'http://localhost:8789',
          basePath: '/events',
          healthPath: '/health',
          timeoutMs: 10_000,
          exposure: 'private',
          headers: {},
          requiredSecretRefs: [],
        },
      },

      dependencies: [],

      retry: {
        enabled: false,
      },

      rateLimit: {
        enabled: false,
      },

      requiredConfigKeys: [],
      requiredSecretRefs: [],
      tags: ['events', 'queue', 'local'],
      metadata: {
        serviceType: 'async',
      },
    },
  },
} satisfies ServicesConfig;

export default defaultServicesConfig;
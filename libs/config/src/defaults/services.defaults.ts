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

      dependencies: [
        {
          service: 'api-gateway',
          required: true,
          protocol: 'cloudflare-service-binding',
          binding: 'API_GATEWAY_SERVICE',
          purpose: 'Route frontend API requests to internal Helix API gateway.',
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
      exposure: 'edge',

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
          protocol: 'cloudflare-service-binding',
          binding: 'AUTH_SERVICE',
          purpose: 'Authenticate requests and resolve user/session context.',
        },
        {
          service: 'users',
          required: true,
          protocol: 'cloudflare-service-binding',
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
          protocol: 'cloudflare-rpc',
          basePath: '/internal/auth',
          healthPath: '/health',
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
          protocol: 'cloudflare-service-binding',
          binding: 'USER_SERVICE',
          purpose: 'Resolve users and profile metadata during authentication.',
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

      requiredConfigKeys: ['auth'],
      requiredSecretRefs: [
        'AUTH_SECRET',
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
          protocol: 'cloudflare-rpc',
          basePath: '/internal/users',
          healthPath: '/health',
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
          service: 'events',
          required: true,
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
      requiredSecretRefs: ['DATABASE_URL'],
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
      exposure: 'webhook',

      endpoints: {
        interactions: {
          name: 'interactions',
          protocol: 'https',
          url: 'https://helixaibot.com/api/discord/interactions',
          basePath: '/api/discord',
          healthPath: '/health',
          timeoutMs: 3_000,
          exposure: 'webhook',
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
          protocol: 'cloudflare-service-binding',
          binding: 'API_GATEWAY_SERVICE',
          purpose: 'Call shared API workflows when Discord commands need app data.',
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
          service: 'api-gateway',
          required: false,
          protocol: 'http',
          endpoint: 'public',
          purpose: 'Call the local API gateway during development.',
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

      dependencies: [],

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
  },
} satisfies ServicesConfig;

export default defaultServicesConfig;
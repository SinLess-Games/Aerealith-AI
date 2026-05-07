import type { CloudflareConfig } from '../types/cloudflare';

export const defaultCloudflareCompatibilityDate = '2026-05-07';

export const defaultCloudflareConfig = {
  enabled: false,

  defaultEnvironment: 'development',

  account: {
    accountId: undefined,
    apiTokenRef: 'CLOUDFLARE_API_TOKEN',
    zoneId: undefined,
    zoneName: 'helixaibot.com',
  },

  worker: {
    name: 'helix-frontend',
    runtime: 'opennext',
    main: '.open-next/worker.js',
    compatibilityDate: defaultCloudflareCompatibilityDate,
    compatibilityFlags: ['nodejs_compat'],
    workersDev: true,

    routes: [],

    customDomains: [],

    bindings: {
      vars: {
        values: {
          APP_NAME: 'Helix AI',
          APP_ENV: 'development',
          APP_URL: 'http://localhost:3000',
          PUBLIC_APP_URL: 'http://localhost:3000',
          PRIMARY_DOMAIN: 'helixaibot.com',
        },
      },

      secrets: {
        required: [],
        optional: [
          'AUTH_SECRET',
          'DATABASE_URL',
          'DISCORD_BOT_TOKEN',
          'DISCORD_PUBLIC_KEY',
          'GITHUB_CLIENT_SECRET',
          'GOOGLE_CLIENT_SECRET',
          'UPSTASH_REDIS_REST_URL',
          'UPSTASH_REDIS_REST_TOKEN',
        ],
        localFile: '.dev.vars',
      },

      kvNamespaces: {},
      r2Buckets: {},
      queues: {},
      durableObjects: {},
      d1Databases: {},
      hyperdrive: {},
      vectorize: {},
      services: {},
      workflows: {},
      analyticsEngine: {},
      dispatchNamespaces: {},

      ai: {
        binding: 'AI',
        enabled: false,
        defaultModel: undefined,
      },

      browserRendering: {
        binding: 'BROWSER',
        enabled: false,
      },
    },

    placement: {
      enabled: false,
      mode: undefined,
    },

    limits: {
      maxRequestBodyBytes: 10 * 1024 * 1024,
      requestTimeoutMs: 30_000,
      cpuBudgetMs: undefined,
    },

    tags: ['helix', 'frontend', 'cloudflare', 'development'],

    metadata: {
      app: 'helix-ai',
      owner: 'SinLess Games LLC',
      domain: 'helixaibot.com',
    },
  },

  environments: {
    development: {
      name: 'development',
      workerName: 'helix-frontend-dev',

      routes: [],

      customDomains: [],

      bindings: {
        vars: {
          values: {
            APP_NAME: 'Helix AI',
            APP_ENV: 'development',
            APP_URL: 'http://localhost:3000',
            PUBLIC_APP_URL: 'http://localhost:3000',
            PRIMARY_DOMAIN: 'helixaibot.com',
          },
        },

        secrets: {
          required: [],
          optional: [
            'AUTH_SECRET',
            'DATABASE_URL',
            'DISCORD_BOT_TOKEN',
            'DISCORD_PUBLIC_KEY',
            'GITHUB_CLIENT_SECRET',
            'GOOGLE_CLIENT_SECRET',
            'UPSTASH_REDIS_REST_URL',
            'UPSTASH_REDIS_REST_TOKEN',
          ],
          localFile: '.dev.vars',
        },

        kvNamespaces: {
          FEATURE_FLAGS: {
            binding: 'FEATURE_FLAGS',
            id: undefined,
            previewId: undefined,
            purpose: 'feature-flags',
          },
        },

        r2Buckets: {
          HELIX_UPLOADS_BUCKET: {
            binding: 'HELIX_UPLOADS_BUCKET',
            bucketName: 'helix-dev-uploads',
            previewBucketName: 'helix-dev-uploads-preview',
            publicUrl: undefined,
            purpose: 'uploads',
          },
        },

        queues: {
          HELIX_EVENTS_QUEUE: {
            binding: 'HELIX_EVENTS_QUEUE',
            queueName: 'helix-dev-events',
            role: 'producer-consumer',
            eventTypes: [
              'user.created',
              'user.updated',
              'assistant.message.created',
              'automation.requested',
              'audit.event.created',
            ],
            deadLetterQueueName: 'helix-dev-events-dlq',
            maxBatchSize: 10,
            maxBatchTimeoutSeconds: 5,
            maxRetries: 3,
          },
        },

        durableObjects: {},

        d1Databases: {
          DB: {
            binding: 'DB',
            databaseName: 'helix-dev-metadata',
            databaseId: undefined,
            previewDatabaseId: undefined,
            secondaryOnly: true,
          },
        },

        hyperdrive: {
          HYPERDRIVE: {
            binding: 'HYPERDRIVE',
            id: undefined,
            originDatabaseUrlRef: 'DATABASE_URL',
            purpose: 'primary-postgres',
          },
        },

        vectorize: {
          MEMORY_INDEX: {
            binding: 'MEMORY_INDEX',
            indexName: 'helix-dev-memory',
            indexId: undefined,
            dimensions: 1536,
            purpose: 'semantic-memory',
          },
        },

        services: {
          API_GATEWAY_SERVICE: {
            binding: 'API_GATEWAY_SERVICE',
            service: 'helix-api-gateway-dev',
            entrypoint: 'ApiGatewayService',
            mode: 'rpc',
            purpose: 'internal-api-gateway',
          },
          AUTH_SERVICE: {
            binding: 'AUTH_SERVICE',
            service: 'helix-auth-service-dev',
            entrypoint: 'AuthService',
            mode: 'rpc',
            purpose: 'internal-auth-service',
          },
          USER_SERVICE: {
            binding: 'USER_SERVICE',
            service: 'helix-user-service-dev',
            entrypoint: 'UserService',
            mode: 'rpc',
            purpose: 'internal-user-service',
          },
        },

        workflows: {},

        analyticsEngine: {},

        dispatchNamespaces: {},

        ai: {
          binding: 'AI',
          enabled: false,
          defaultModel: undefined,
        },

        browserRendering: {
          binding: 'BROWSER',
          enabled: false,
        },
      },

      compatibilityDate: defaultCloudflareCompatibilityDate,
      compatibilityFlags: ['nodejs_compat'],
      deployable: true,
      requiresApproval: false,
    },

    preview: {
      name: 'preview',
      workerName: 'helix-frontend-preview',

      routes: [],

      customDomains: [],

      bindings: {
        vars: {
          values: {
            APP_NAME: 'Helix AI',
            APP_ENV: 'preview',
            APP_URL: 'https://preview.helixaibot.com',
            PUBLIC_APP_URL: 'https://preview.helixaibot.com',
            PRIMARY_DOMAIN: 'helixaibot.com',
          },
        },

        secrets: {
          required: [
            'AUTH_SECRET',
            'DATABASE_URL',
          ],
          optional: [
            'DISCORD_BOT_TOKEN',
            'DISCORD_PUBLIC_KEY',
            'GITHUB_CLIENT_SECRET',
            'GOOGLE_CLIENT_SECRET',
            'UPSTASH_REDIS_REST_URL',
            'UPSTASH_REDIS_REST_TOKEN',
          ],
          localFile: '.dev.vars.preview',
        },

        kvNamespaces: {
          FEATURE_FLAGS: {
            binding: 'FEATURE_FLAGS',
            id: undefined,
            previewId: undefined,
            purpose: 'feature-flags',
          },
        },

        r2Buckets: {
          HELIX_UPLOADS_BUCKET: {
            binding: 'HELIX_UPLOADS_BUCKET',
            bucketName: 'helix-preview-uploads',
            previewBucketName: 'helix-preview-uploads-preview',
            publicUrl: undefined,
            purpose: 'uploads',
          },
        },

        queues: {
          HELIX_EVENTS_QUEUE: {
            binding: 'HELIX_EVENTS_QUEUE',
            queueName: 'helix-preview-events',
            role: 'producer-consumer',
            eventTypes: [
              'user.created',
              'user.updated',
              'assistant.message.created',
              'automation.requested',
              'audit.event.created',
            ],
            deadLetterQueueName: 'helix-preview-events-dlq',
            maxBatchSize: 10,
            maxBatchTimeoutSeconds: 5,
            maxRetries: 3,
          },
        },

        durableObjects: {},

        d1Databases: {
          DB: {
            binding: 'DB',
            databaseName: 'helix-preview-metadata',
            databaseId: undefined,
            previewDatabaseId: undefined,
            secondaryOnly: true,
          },
        },

        hyperdrive: {
          HYPERDRIVE: {
            binding: 'HYPERDRIVE',
            id: undefined,
            originDatabaseUrlRef: 'DATABASE_URL',
            purpose: 'primary-postgres',
          },
        },

        vectorize: {
          MEMORY_INDEX: {
            binding: 'MEMORY_INDEX',
            indexName: 'helix-preview-memory',
            indexId: undefined,
            dimensions: 1536,
            purpose: 'semantic-memory',
          },
        },

        services: {
          API_GATEWAY_SERVICE: {
            binding: 'API_GATEWAY_SERVICE',
            service: 'helix-api-gateway-preview',
            entrypoint: 'ApiGatewayService',
            mode: 'rpc',
            purpose: 'internal-api-gateway',
          },
          AUTH_SERVICE: {
            binding: 'AUTH_SERVICE',
            service: 'helix-auth-service-preview',
            entrypoint: 'AuthService',
            mode: 'rpc',
            purpose: 'internal-auth-service',
          },
          USER_SERVICE: {
            binding: 'USER_SERVICE',
            service: 'helix-user-service-preview',
            entrypoint: 'UserService',
            mode: 'rpc',
            purpose: 'internal-user-service',
          },
        },

        workflows: {},

        analyticsEngine: {},

        dispatchNamespaces: {},

        ai: {
          binding: 'AI',
          enabled: false,
          defaultModel: undefined,
        },

        browserRendering: {
          binding: 'BROWSER',
          enabled: false,
        },
      },

      compatibilityDate: defaultCloudflareCompatibilityDate,
      compatibilityFlags: ['nodejs_compat'],
      deployable: true,
      requiresApproval: false,
    },

    production: {
      name: 'production',
      workerName: 'helix-frontend',

      /**
       * The web app should live on helixaibot.com, not app.helixaibot.com.
       */
      routes: [
        {
          pattern: 'helixaibot.com',
          zoneName: 'helixaibot.com',
          zoneId: undefined,
          mode: 'custom-domain',
          enabled: true,
        },
      ],

      customDomains: [
        {
          hostname: 'helixaibot.com',
          zoneName: 'helixaibot.com',
          zoneId: undefined,
          enabled: true,
        },
      ],

      bindings: {
        vars: {
          values: {
            APP_NAME: 'Helix AI',
            APP_ENV: 'production',
            APP_URL: 'https://helixaibot.com',
            PUBLIC_APP_URL: 'https://helixaibot.com',
            PRIMARY_DOMAIN: 'helixaibot.com',
          },
        },

        secrets: {
          required: [
            'AUTH_SECRET',
            'DATABASE_URL',
          ],
          optional: [
            'DISCORD_BOT_TOKEN',
            'DISCORD_PUBLIC_KEY',
            'GITHUB_CLIENT_SECRET',
            'GOOGLE_CLIENT_SECRET',
            'GRAFANA_CLOUD_API_TOKEN',
            'UPSTASH_REDIS_REST_URL',
            'UPSTASH_REDIS_REST_TOKEN',
          ],
          localFile: '.dev.vars.production',
        },

        kvNamespaces: {
          FEATURE_FLAGS: {
            binding: 'FEATURE_FLAGS',
            id: undefined,
            previewId: undefined,
            purpose: 'feature-flags',
          },
        },

        r2Buckets: {
          HELIX_UPLOADS_BUCKET: {
            binding: 'HELIX_UPLOADS_BUCKET',
            bucketName: 'helix-prod-uploads',
            previewBucketName: undefined,
            publicUrl: undefined,
            purpose: 'uploads',
          },
          HELIX_EXPORTS_BUCKET: {
            binding: 'HELIX_EXPORTS_BUCKET',
            bucketName: 'helix-prod-exports',
            previewBucketName: undefined,
            publicUrl: undefined,
            purpose: 'exports',
          },
          HELIX_ARTIFACTS_BUCKET: {
            binding: 'HELIX_ARTIFACTS_BUCKET',
            bucketName: 'helix-prod-artifacts',
            previewBucketName: undefined,
            publicUrl: undefined,
            purpose: 'artifacts',
          },
        },

        queues: {
          HELIX_EVENTS_QUEUE: {
            binding: 'HELIX_EVENTS_QUEUE',
            queueName: 'helix-prod-events',
            role: 'producer-consumer',
            eventTypes: [
              'user.created',
              'user.updated',
              'assistant.message.created',
              'automation.requested',
              'audit.event.created',
            ],
            deadLetterQueueName: 'helix-prod-events-dlq',
            maxBatchSize: 10,
            maxBatchTimeoutSeconds: 5,
            maxRetries: 5,
          },
        },

        durableObjects: {
          SESSION_OBJECT: {
            binding: 'SESSION_OBJECT',
            className: 'SessionObject',
            scriptName: undefined,
            storage: 'sqlite',
            purpose: 'websocket-sessions',
          },
        },

        d1Databases: {
          DB: {
            binding: 'DB',
            databaseName: 'helix-prod-metadata',
            databaseId: undefined,
            previewDatabaseId: undefined,
            secondaryOnly: true,
          },
        },

        hyperdrive: {
          HYPERDRIVE: {
            binding: 'HYPERDRIVE',
            id: undefined,
            originDatabaseUrlRef: 'DATABASE_URL',
            purpose: 'primary-postgres',
          },
        },

        vectorize: {
          MEMORY_INDEX: {
            binding: 'MEMORY_INDEX',
            indexName: 'helix-prod-memory',
            indexId: undefined,
            dimensions: 1536,
            purpose: 'semantic-memory',
          },
        },

        services: {
          API_GATEWAY_SERVICE: {
            binding: 'API_GATEWAY_SERVICE',
            service: 'helix-api-gateway',
            entrypoint: 'ApiGatewayService',
            mode: 'rpc',
            purpose: 'internal-api-gateway',
          },
          AUTH_SERVICE: {
            binding: 'AUTH_SERVICE',
            service: 'helix-auth-service',
            entrypoint: 'AuthService',
            mode: 'rpc',
            purpose: 'internal-auth-service',
          },
          USER_SERVICE: {
            binding: 'USER_SERVICE',
            service: 'helix-user-service',
            entrypoint: 'UserService',
            mode: 'rpc',
            purpose: 'internal-user-service',
          },
        },

        workflows: {
          USER_ONBOARDING_WORKFLOW: {
            binding: 'USER_ONBOARDING_WORKFLOW',
            name: 'user-onboarding',
            className: 'UserOnboardingWorkflow',
            purpose: 'user-onboarding',
          },
        },

        analyticsEngine: {},

        dispatchNamespaces: {},

        ai: {
          binding: 'AI',
          enabled: false,
          defaultModel: undefined,
        },

        browserRendering: {
          binding: 'BROWSER',
          enabled: false,
        },
      },

      compatibilityDate: defaultCloudflareCompatibilityDate,
      compatibilityFlags: ['nodejs_compat'],
      deployable: true,
      requiresApproval: true,
    },
  },

  ci: {
    enabled: true,
    provider: 'github-actions',
    accountIdRef: 'CLOUDFLARE_ACCOUNT_ID',
    apiTokenRef: 'CLOUDFLARE_API_TOKEN',
    productionApprovalRequired: true,
    gradualDeploymentsEnabled: true,
  },

  requiredBindingKinds: [
    'vars',
    'secrets',
    'kv',
    'r2',
    'queue',
    'durable-object',
    'd1',
    'hyperdrive',
    'vectorize',
    'service',
    'workflow',
  ],

  metadata: {
    app: 'helix-ai',
    owner: 'SinLess Games LLC',
    domain: 'helixaibot.com',
    monorepo: 'nx',
    frontend: 'nextjs',
  },
} satisfies CloudflareConfig;

export const defaultProductionCloudflareConfig = {
  ...defaultCloudflareConfig,
  enabled: true,
  defaultEnvironment: 'production',
} satisfies CloudflareConfig;

export const defaultLocalCloudflareConfig = {
  ...defaultCloudflareConfig,
  enabled: false,
  defaultEnvironment: 'development',

  account: {
    accountId: undefined,
    apiTokenRef: undefined,
    zoneId: undefined,
    zoneName: 'helixaibot.com',
  },

  ci: {
    enabled: false,
    provider: 'local',
    accountIdRef: undefined,
    apiTokenRef: undefined,
    productionApprovalRequired: true,
    gradualDeploymentsEnabled: false,
  },
} satisfies CloudflareConfig;

export default defaultCloudflareConfig;
import type { DiscordConfig } from '../types/discord';

export const defaultDiscordConfig = {
  enabled: false,

  authMode: 'none',

  /**
   * Cloudflare-friendly default.
   *
   * HTTP interactions avoid a long-lived Gateway connection and are a better
   * fit for Workers.
   */
  runtimeMode: 'http-interactions',

  apiBaseUrl: 'https://discord.com/api/v10',

  webBaseUrl: 'https://discord.com',

  oauth: {
    clientId: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: undefined,
    scopes: ['identify', 'email'],
  },

  bot: {
    enabled: false,
    applicationId: undefined,
    botUserId: undefined,
    publicKey: undefined,
    tokenRef: 'DISCORD_BOT_TOKEN',
    permissions: undefined,
    scopes: ['bot', 'applications.commands'],
    publicInstall: false,
    requireCodeGrant: false,
  },

  gateway: {
    enabled: false,
    intents: [],
    messageContentIntentRequired: false,
    guildMembersIntentRequired: false,
    guildPresencesIntentRequired: false,
    shardCount: undefined,
    shardIds: undefined,
  },

  interactions: {
    enabled: false,
    endpointUrl: undefined,
    endpointPath: '/api/discord/interactions',
    verifySignatures: true,
    initialResponseTimeoutMs: 3_000,
    deferredResponsesEnabled: true,
  },

  commands: {},

  guilds: {},

  webhooks: {},

  events: {},

  moderation: {
    enabled: false,
    requireConfirmation: true,
    auditLogEnabled: true,
    auditChannel: undefined,
    requiredPermissions: [],
  },

  tickets: {
    enabled: false,
    categoryId: undefined,
    transcriptChannelId: undefined,
    staffRoleIds: [],
    externalTranscriptStorageEnabled: true,
  },

  requiredSecretRefs: [],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
  },
} satisfies DiscordConfig;

export const defaultProductionDiscordConfig = {
  enabled: true,

  authMode: 'interactions-endpoint',

  runtimeMode: 'http-interactions',

  apiBaseUrl: 'https://discord.com/api/v10',

  webBaseUrl: 'https://discord.com',

  oauth: {
    clientId: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: 'https://helixaibot.com/api/auth/callback/discord',
    scopes: ['identify', 'email'],
  },

  bot: {
    enabled: true,
    applicationId: undefined,
    botUserId: undefined,

    /**
     * Discord application public key.
     *
     * This is not a secret, but it should still be configured per environment.
     */
    publicKey: undefined,

    /**
     * Secret reference only.
     */
    tokenRef: 'DISCORD_BOT_TOKEN',

    /**
     * Keep unset until you calculate the exact permissions bitfield.
     */
    permissions: undefined,

    scopes: ['bot', 'applications.commands'],
    publicInstall: false,
    requireCodeGrant: false,
  },

  gateway: {
    enabled: false,
    intents: [],
    messageContentIntentRequired: false,
    guildMembersIntentRequired: false,
    guildPresencesIntentRequired: false,
    shardCount: undefined,
    shardIds: undefined,
  },

  interactions: {
    enabled: true,
    endpointUrl: 'https://helixaibot.com/api/discord/interactions',
    endpointPath: '/api/discord/interactions',
    verifySignatures: true,
    initialResponseTimeoutMs: 3_000,
    deferredResponsesEnabled: true,
  },

  commands: {
    help: {
      name: 'help',
      description: 'Show available Helix AI commands.',
      type: 'slash',
      scope: 'global',
      guildId: undefined,
      enabled: true,
      nsfw: false,
      defaultMemberPermissions: undefined,
      dmPermission: true,
      requiredPermissions: [],
      requiredFeatureFlags: [],
    },

    status: {
      name: 'status',
      description: 'Show Helix AI service status.',
      type: 'slash',
      scope: 'global',
      guildId: undefined,
      enabled: true,
      nsfw: false,
      defaultMemberPermissions: undefined,
      dmPermission: true,
      requiredPermissions: [],
      requiredFeatureFlags: [],
    },

    profile: {
      name: 'profile',
      description: 'View or update your Helix AI profile preferences.',
      type: 'slash',
      scope: 'global',
      guildId: undefined,
      enabled: true,
      nsfw: false,
      defaultMemberPermissions: undefined,
      dmPermission: true,
      requiredPermissions: [],
      requiredFeatureFlags: ['discord-profile-command'],
    },
  },

  guilds: {},

  webhooks: {
    alerts: {
      name: 'alerts',
      enabled: false,
      purpose: 'alerts',
      channelId: undefined,
      urlRef: 'DISCORD_ALERTS_WEBHOOK_URL',
      username: 'Helix AI Alerts',
      avatarUrl: undefined,
      allowedEvents: [
        'deployment.failed',
        'security.alert.created',
        'service.degraded',
      ],
    },

    audit: {
      name: 'audit',
      enabled: false,
      purpose: 'audit',
      channelId: undefined,
      urlRef: 'DISCORD_AUDIT_WEBHOOK_URL',
      username: 'Helix AI Audit',
      avatarUrl: undefined,
      allowedEvents: [
        'audit.event.created',
        'user.role.changed',
        'admin.action.completed',
      ],
    },
  },

  events: {
    interactionReceived: {
      name: 'interactionReceived',
      enabled: true,
      delivery: 'queue',
      queue: 'HELIX_EVENTS_QUEUE',
      requiredIntents: [],
      requiredFeatureFlags: [],
    },

    commandExecuted: {
      name: 'commandExecuted',
      enabled: true,
      delivery: 'queue',
      queue: 'HELIX_EVENTS_QUEUE',
      requiredIntents: [],
      requiredFeatureFlags: [],
    },
  },

  moderation: {
    enabled: false,
    requireConfirmation: true,
    auditLogEnabled: true,
    auditChannel: undefined,
    requiredPermissions: [],
  },

  tickets: {
    enabled: false,
    categoryId: undefined,
    transcriptChannelId: undefined,
    staffRoleIds: [],
    externalTranscriptStorageEnabled: true,
  },

  requiredSecretRefs: [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_PUBLIC_KEY',
  ],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
    domain: 'helixaibot.com',
    runtime: 'cloudflare-worker',
  },
} satisfies DiscordConfig;

export const defaultLocalDiscordConfig = {
  enabled: true,

  authMode: 'interactions-endpoint',

  runtimeMode: 'http-interactions',

  apiBaseUrl: 'https://discord.com/api/v10',

  webBaseUrl: 'https://discord.com',

  oauth: {
    clientId: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/api/auth/callback/discord',
    scopes: ['identify', 'email'],
  },

  bot: {
    enabled: true,
    applicationId: undefined,
    botUserId: undefined,
    publicKey: undefined,
    tokenRef: 'DISCORD_BOT_TOKEN',
    permissions: undefined,
    scopes: ['bot', 'applications.commands'],
    publicInstall: false,
    requireCodeGrant: false,
  },

  gateway: {
    enabled: false,
    intents: [],
    messageContentIntentRequired: false,
    guildMembersIntentRequired: false,
    guildPresencesIntentRequired: false,
    shardCount: undefined,
    shardIds: undefined,
  },

  interactions: {
    enabled: true,
    endpointUrl: undefined,
    endpointPath: '/api/discord/interactions',
    verifySignatures: true,
    initialResponseTimeoutMs: 3_000,
    deferredResponsesEnabled: true,
  },

  commands: {
    help: {
      name: 'help',
      description: 'Show available Helix AI commands.',
      type: 'slash',
      scope: 'guild',
      guildId: undefined,
      enabled: true,
      nsfw: false,
      defaultMemberPermissions: undefined,
      dmPermission: true,
      requiredPermissions: [],
      requiredFeatureFlags: [],
    },

    status: {
      name: 'status',
      description: 'Show local Helix AI service status.',
      type: 'slash',
      scope: 'guild',
      guildId: undefined,
      enabled: true,
      nsfw: false,
      defaultMemberPermissions: undefined,
      dmPermission: true,
      requiredPermissions: [],
      requiredFeatureFlags: [],
    },
  },

  guilds: {},

  webhooks: {},

  events: {
    interactionReceived: {
      name: 'interactionReceived',
      enabled: true,
      delivery: 'queue',
      queue: 'HELIX_EVENTS_QUEUE',
      requiredIntents: [],
      requiredFeatureFlags: [],
    },
  },

  moderation: {
    enabled: false,
    requireConfirmation: true,
    auditLogEnabled: true,
    auditChannel: undefined,
    requiredPermissions: [],
  },

  tickets: {
    enabled: false,
    categoryId: undefined,
    transcriptChannelId: undefined,
    staffRoleIds: [],
    externalTranscriptStorageEnabled: false,
  },

  requiredSecretRefs: ['DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY'],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
    runtime: 'local',
  },
} satisfies DiscordConfig;

export const defaultDiscordGatewayConfig = {
  enabled: true,

  authMode: 'bot-token',

  runtimeMode: 'gateway',

  apiBaseUrl: 'https://discord.com/api/v10',

  webBaseUrl: 'https://discord.com',

  oauth: {
    clientId: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: undefined,
    scopes: ['identify', 'email'],
  },

  bot: {
    enabled: true,
    applicationId: undefined,
    botUserId: undefined,
    publicKey: undefined,
    tokenRef: 'DISCORD_BOT_TOKEN',
    permissions: undefined,
    scopes: ['bot', 'applications.commands'],
    publicInstall: false,
    requireCodeGrant: false,
  },

  gateway: {
    enabled: true,
    intents: ['Guilds'],
    messageContentIntentRequired: false,
    guildMembersIntentRequired: false,
    guildPresencesIntentRequired: false,
    shardCount: undefined,
    shardIds: undefined,
  },

  interactions: {
    enabled: false,
    endpointUrl: undefined,
    endpointPath: undefined,
    verifySignatures: true,
    initialResponseTimeoutMs: 3_000,
    deferredResponsesEnabled: true,
  },

  commands: {},

  guilds: {},

  webhooks: {},

  events: {
    gatewayReady: {
      name: 'gatewayReady',
      enabled: true,
      delivery: 'gateway',
      queue: undefined,
      requiredIntents: ['Guilds'],
      requiredFeatureFlags: [],
    },
  },

  moderation: {
    enabled: false,
    requireConfirmation: true,
    auditLogEnabled: true,
    auditChannel: undefined,
    requiredPermissions: [],
  },

  tickets: {
    enabled: false,
    categoryId: undefined,
    transcriptChannelId: undefined,
    staffRoleIds: [],
    externalTranscriptStorageEnabled: true,
  },

  requiredSecretRefs: ['DISCORD_BOT_TOKEN'],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
    runtime: 'node',
  },
} satisfies DiscordConfig;

export default defaultDiscordConfig;
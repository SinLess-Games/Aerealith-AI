export type DiscordAuthMode =
  | 'bot-token'
  | 'oauth2'
  | 'interactions-endpoint'
  | 'webhook'
  | 'none'
  | string;

export type DiscordRuntimeMode =
  | 'gateway'
  | 'http-interactions'
  | 'hybrid'
  | 'worker'
  | 'node'
  | string;

export type DiscordCommandScope =
  | 'global'
  | 'guild'
  | string;

export type DiscordCommandType =
  | 'slash'
  | 'user'
  | 'message'
  | 'entry-point'
  | string;

export type DiscordEventDelivery =
  | 'gateway'
  | 'webhook'
  | 'queue'
  | 'disabled'
  | string;

export type DiscordChannelPurpose =
  | 'general'
  | 'logs'
  | 'moderation'
  | 'tickets'
  | 'alerts'
  | 'announcements'
  | 'support'
  | 'devops'
  | 'audit'
  | string;

export type DiscordPermissionLevel =
  | 'none'
  | 'read'
  | 'write'
  | 'manage'
  | 'admin'
  | string;

export interface DiscordOAuth2Config {
  /**
   * Discord application client ID.
   */
  clientId?: string;

  /**
   * Secret reference name for the Discord OAuth2 client secret.
   *
   * Do not store the actual secret value here.
   */
  clientSecretRef?: string;

  /**
   * OAuth2 redirect URI.
   */
  redirectUri?: string;

  /**
   * OAuth2 scopes requested for user authorization.
   *
   * Common examples:
   * identify, email, guilds, guilds.join, applications.commands
   */
  scopes?: string[];
}

export interface DiscordBotConfig {
  /**
   * Whether the Discord bot user is enabled.
   */
  enabled: boolean;

  /**
   * Discord application ID.
   */
  applicationId?: string;

  /**
   * Discord bot user ID.
   */
  botUserId?: string;

  /**
   * Public key used to verify Discord interaction requests.
   */
  publicKey?: string;

  /**
   * Secret reference name for the bot token.
   *
   * Do not store the actual bot token here.
   */
  tokenRef?: string;

  /**
   * Permission integer used in the Discord install URL.
   */
  permissions?: string;

  /**
   * OAuth2 scopes used when installing the bot.
   *
   * Common examples:
   * bot, applications.commands
   */
  scopes?: string[];

  /**
   * Whether the bot should be publicly installable.
   */
  publicInstall?: boolean;

  /**
   * Whether the bot requires OAuth2 code grant during installation.
   */
  requireCodeGrant?: boolean;
}

export interface DiscordGatewayIntentConfig {
  /**
   * Whether Gateway usage is enabled.
   *
   * Gateway mode is useful for receiving real-time events like message create,
   * guild member updates, reactions, and other event streams.
   */
  enabled: boolean;

  /**
   * Raw Gateway intent names used by your bot runtime.
   *
   * Examples:
   * Guilds, GuildMessages, MessageContent
   */
  intents: string[];

  /**
   * Whether the MESSAGE_CONTENT privileged intent is required.
   */
  messageContentIntentRequired?: boolean;

  /**
   * Whether the GUILD_MEMBERS privileged intent is required.
   */
  guildMembersIntentRequired?: boolean;

  /**
   * Whether the GUILD_PRESENCES privileged intent is required.
   */
  guildPresencesIntentRequired?: boolean;

  /**
   * Optional shard count for larger bot deployments.
   */
  shardCount?: number;

  /**
   * Optional shard IDs this deployment owns.
   */
  shardIds?: number[];
}

export interface DiscordInteractionsConfig {
  /**
   * Whether HTTP interactions are enabled.
   *
   * This is a good fit for Cloudflare Workers because Discord can POST
   * interactions directly to an endpoint.
   */
  enabled: boolean;

  /**
   * Public endpoint URL configured in the Discord Developer Portal.
   */
  endpointUrl?: string;

  /**
   * HTTP path used by this app for Discord interactions.
   *
   * Example:
   * /api/discord/interactions
   */
  endpointPath?: string;

  /**
   * Whether incoming interaction request signature validation is required.
   */
  verifySignatures: boolean;

  /**
   * Maximum amount of time allowed before sending the initial interaction
   * response or deferred response, in milliseconds.
   */
  initialResponseTimeoutMs?: number;

  /**
   * Whether delayed/deferred responses are allowed for long-running actions.
   */
  deferredResponsesEnabled?: boolean;
}

export interface DiscordCommandConfig {
  /**
   * Logical command key.
   *
   * Example:
   * ask, remember, ticket, status
   */
  name: string;

  /**
   * Human-readable command description.
   */
  description?: string;

  /**
   * Command type.
   */
  type: DiscordCommandType;

  /**
   * Command registration scope.
   */
  scope: DiscordCommandScope;

  /**
   * Guild ID when scope is guild-specific.
   */
  guildId?: string;

  /**
   * Whether this command is enabled.
   */
  enabled: boolean;

  /**
   * Whether this command should be age-restricted.
   */
  nsfw?: boolean;

  /**
   * Optional default member permissions bitset as a string.
   */
  defaultMemberPermissions?: string;

  /**
   * Whether the command is available in DMs/private channels where supported.
   */
  dmPermission?: boolean;

  /**
   * Required internal Helix permission names for this command.
   */
  requiredPermissions?: string[];

  /**
   * Required feature flags for this command.
   */
  requiredFeatureFlags?: string[];
}

export interface DiscordGuildConfig {
  /**
   * Logical guild key.
   *
   * Example:
   * sinless-games, helix-community
   */
  name: string;

  /**
   * Discord guild/server ID.
   */
  id: string;

  /**
   * Whether this guild is enabled for Helix bot features.
   */
  enabled: boolean;

  /**
   * Optional command registration mode for this guild.
   */
  commandScope?: DiscordCommandScope;

  /**
   * Optional default role IDs used by Helix.
   */
  roles?: Record<string, string>;

  /**
   * Optional default channel IDs used by Helix.
   */
  channels?: Record<DiscordChannelPurpose, string>;

  /**
   * Optional guild-specific feature flags.
   */
  featureFlags?: Record<string, boolean>;
}

export interface DiscordWebhookConfig {
  /**
   * Logical webhook name.
   *
   * Example:
   * deploy-alerts, audit-log, moderation-log
   */
  name: string;

  /**
   * Whether this webhook is enabled.
   */
  enabled: boolean;

  /**
   * What this webhook is used for.
   */
  purpose: DiscordChannelPurpose;

  /**
   * Discord channel ID this webhook posts to, when known.
   */
  channelId?: string;

  /**
   * Secret reference name for the full webhook URL.
   *
   * Do not store the webhook URL itself in committed config.
   */
  urlRef?: string;

  /**
   * Optional default username override.
   */
  username?: string;

  /**
   * Optional default avatar URL.
   */
  avatarUrl?: string;

  /**
   * Optional allowed event names for this webhook.
   */
  allowedEvents?: string[];
}

export interface DiscordEventConfig {
  /**
   * Logical event key.
   *
   * Example:
   * messageCreate, guildMemberAdd, interactionCreate
   */
  name: string;

  /**
   * Whether this event is enabled.
   */
  enabled: boolean;

  /**
   * How the event is delivered to Helix.
   */
  delivery: DiscordEventDelivery;

  /**
   * Optional Cloudflare Queue binding or queue name used for async processing.
   */
  queue?: string;

  /**
   * Required Gateway intent names for this event.
   */
  requiredIntents?: string[];

  /**
   * Required feature flags for this event.
   */
  requiredFeatureFlags?: string[];
}

export interface DiscordModerationConfig {
  /**
   * Whether moderation features are enabled.
   */
  enabled: boolean;

  /**
   * Whether moderation actions require explicit confirmation.
   */
  requireConfirmation?: boolean;

  /**
   * Whether actions should be written to an audit channel/log.
   */
  auditLogEnabled?: boolean;

  /**
   * Audit channel ID or logical channel key.
   */
  auditChannel?: string;

  /**
   * Permission names required to run moderation actions.
   */
  requiredPermissions?: string[];
}

export interface DiscordTicketsConfig {
  /**
   * Whether ticket/support features are enabled.
   */
  enabled: boolean;

  /**
   * Category ID for created ticket channels.
   */
  categoryId?: string;

  /**
   * Channel ID for ticket transcripts/logs.
   */
  transcriptChannelId?: string;

  /**
   * Role IDs allowed to manage tickets.
   */
  staffRoleIds?: string[];

  /**
   * Whether ticket transcripts should be stored outside Discord.
   */
  externalTranscriptStorageEnabled?: boolean;
}

export interface DiscordConfig {
  /**
   * Whether Discord integration is enabled.
   */
  enabled: boolean;

  /**
   * Preferred Discord authentication/integration mode.
   */
  authMode: DiscordAuthMode;

  /**
   * Runtime mode used by the Discord integration.
   *
   * For Cloudflare Workers, prefer http-interactions when possible.
   * For a long-running bot process, use gateway or hybrid.
   */
  runtimeMode: DiscordRuntimeMode;

  /**
   * Discord API base URL.
   */
  apiBaseUrl?: string;

  /**
   * Discord OAuth2/user-facing base URL.
   */
  webBaseUrl?: string;

  /**
   * OAuth2 user authorization config.
   */
  oauth?: DiscordOAuth2Config;

  /**
   * Bot user config.
   */
  bot: DiscordBotConfig;

  /**
   * Gateway config for real-time bot events.
   */
  gateway?: DiscordGatewayIntentConfig;

  /**
   * HTTP interaction endpoint config.
   */
  interactions?: DiscordInteractionsConfig;

  /**
   * Slash/user/message command registry.
   */
  commands?: Record<string, DiscordCommandConfig>;

  /**
   * Guild/server registry.
   */
  guilds?: Record<string, DiscordGuildConfig>;

  /**
   * Webhooks used for one-way Discord notifications.
   */
  webhooks?: Record<string, DiscordWebhookConfig>;

  /**
   * Discord event subscription/processing config.
   */
  events?: Record<string, DiscordEventConfig>;

  /**
   * Moderation feature config.
   */
  moderation?: DiscordModerationConfig;

  /**
   * Ticket/support feature config.
   */
  tickets?: DiscordTicketsConfig;

  /**
   * Required secret reference names.
   *
   * Examples:
   * DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET
   */
  requiredSecretRefs?: string[];

  /**
   * Optional metadata for dashboards, deployment routing, or ownership.
   */
  metadata?: Record<string, string | number | boolean | null>;
}
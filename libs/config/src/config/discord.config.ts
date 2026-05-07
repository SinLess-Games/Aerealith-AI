import type { DiscordConfig } from '../types/discord';

import {
  defaultDiscordConfig,
  defaultDiscordGatewayConfig,
  defaultLocalDiscordConfig,
  defaultProductionDiscordConfig,
} from '../defaults/discord.defaults';
import { discordSchema } from '../schema/discord.schema';
import { deepClone, deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  resolveAppEnvironment,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type DiscordConfigProfile =
  | 'default'
  | 'local'
  | 'production'
  | 'gateway'
  | 'auto';

export type ResolvedDiscordConfigProfile = Exclude<
  DiscordConfigProfile,
  'auto'
>;

export type DiscordConfigOptions = {
  name?: string;
  profile?: DiscordConfigProfile;
  defaults?: DiscordConfig;
};

type KnownDiscordCommand = {
  key: string;
  envPrefix: string;
};

type KnownDiscordWebhook = {
  key: string;
  envPrefix: string;
};

type KnownDiscordEvent = {
  key: string;
  envPrefix: string;
};

const knownDiscordCommands = [
  {
    key: 'help',
    envPrefix: 'DISCORD_COMMAND_HELP',
  },
  {
    key: 'status',
    envPrefix: 'DISCORD_COMMAND_STATUS',
  },
  {
    key: 'profile',
    envPrefix: 'DISCORD_COMMAND_PROFILE',
  },
] satisfies readonly KnownDiscordCommand[];

const knownDiscordWebhooks = [
  {
    key: 'alerts',
    envPrefix: 'DISCORD_WEBHOOK_ALERTS',
  },
  {
    key: 'audit',
    envPrefix: 'DISCORD_WEBHOOK_AUDIT',
  },
] satisfies readonly KnownDiscordWebhook[];

const knownDiscordEvents = [
  {
    key: 'interactionReceived',
    envPrefix: 'DISCORD_EVENT_INTERACTION_RECEIVED',
  },
  {
    key: 'commandExecuted',
    envPrefix: 'DISCORD_EVENT_COMMAND_EXECUTED',
  },
  {
    key: 'gatewayReady',
    envPrefix: 'DISCORD_EVENT_GATEWAY_READY',
  },
] satisfies readonly KnownDiscordEvent[];

export function createDiscordConfig(
  env: EnvRecord = {},
  options: DiscordConfigOptions = {},
): DiscordConfig {
  const configName = options.name ?? 'discord config';
  const profile = resolveDiscordConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveDiscordConfigDefaults(profile);
  const overrides = buildDiscordConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(discordSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data;
}

export function buildDiscordConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyRootDiscordOverrides(env, overrides);
  applyOAuthOverrides(env, overrides);
  applyBotOverrides(env, overrides);
  applyGatewayOverrides(env, overrides);
  applyInteractionsOverrides(env, overrides);
  applyCommandOverrides(env, overrides);
  applyGuildOverrides(env, overrides);
  applyWebhookOverrides(env, overrides);
  applyEventOverrides(env, overrides);
  applyModerationOverrides(env, overrides);
  applyTicketsOverrides(env, overrides);
  applyRequiredSecretOverrides(env, overrides);
  applyDerivedDiscordOverrides(env, overrides);

  return overrides;
}

export function resolveDiscordConfigProfile(
  env: EnvRecord,
  profile: DiscordConfigProfile = 'auto',
): ResolvedDiscordConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitRuntimeMode = getEnv(env, 'DISCORD_RUNTIME_MODE');
  const explicitAuthMode = getEnv(env, 'DISCORD_AUTH_MODE');

  if (explicitRuntimeMode === 'gateway' || explicitAuthMode === 'bot-token') {
    return 'gateway';
  }

  const environment = resolveAppEnvironment(env);

  if (environment === 'production') {
    return 'production';
  }

  if (environment === 'development' || environment === 'test') {
    return 'local';
  }

  return 'default';
}

export function resolveDiscordConfigDefaults(
  profile: ResolvedDiscordConfigProfile,
): DiscordConfig {
  if (profile === 'production') {
    return deepClone(defaultProductionDiscordConfig);
  }

  if (profile === 'local') {
    return deepClone(defaultLocalDiscordConfig);
  }

  if (profile === 'gateway') {
    return deepClone(defaultDiscordGatewayConfig);
  }

  return deepClone(defaultDiscordConfig);
}

/**
 * Backward-compatible default export.
 *
 * Prefer createDiscordConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const discordConfig = createDiscordConfig();

export default discordConfig;

function applyRootDiscordOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_ENABLED', 'enabled');
  applyOptionalString(env, overrides, 'DISCORD_AUTH_MODE', 'authMode');
  applyOptionalString(env, overrides, 'DISCORD_RUNTIME_MODE', 'runtimeMode');
  applyOptionalString(env, overrides, 'DISCORD_API_BASE_URL', 'apiBaseUrl');
  applyOptionalString(env, overrides, 'DISCORD_WEB_BASE_URL', 'webBaseUrl');
}

function applyOAuthOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalString(env, overrides, 'DISCORD_CLIENT_ID', 'oauth.clientId');
  applyOptionalString(
    env,
    overrides,
    'DISCORD_CLIENT_SECRET_REF',
    'oauth.clientSecretRef',
  );
  applyOptionalString(
    env,
    overrides,
    'DISCORD_REDIRECT_URI',
    'oauth.redirectUri',
  );
  applyOptionalList(env, overrides, 'DISCORD_OAUTH_SCOPES', 'oauth.scopes');
}

function applyBotOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_BOT_ENABLED', 'bot.enabled');
  applyOptionalString(
    env,
    overrides,
    'DISCORD_APPLICATION_ID',
    'bot.applicationId',
  );
  applyOptionalString(env, overrides, 'DISCORD_BOT_USER_ID', 'bot.botUserId');
  applyOptionalString(env, overrides, 'DISCORD_PUBLIC_KEY', 'bot.publicKey');
  applyOptionalString(env, overrides, 'DISCORD_BOT_TOKEN_REF', 'bot.tokenRef');
  applyOptionalString(env, overrides, 'DISCORD_BOT_PERMISSIONS', 'bot.permissions');
  applyOptionalList(env, overrides, 'DISCORD_BOT_SCOPES', 'bot.scopes');
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_PUBLIC_INSTALL',
    'bot.publicInstall',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_REQUIRE_CODE_GRANT',
    'bot.requireCodeGrant',
  );
}

function applyGatewayOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_GATEWAY_ENABLED', 'gateway.enabled');
  applyOptionalList(env, overrides, 'DISCORD_GATEWAY_INTENTS', 'gateway.intents');
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_MESSAGE_CONTENT_INTENT_REQUIRED',
    'gateway.messageContentIntentRequired',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_GUILD_MEMBERS_INTENT_REQUIRED',
    'gateway.guildMembersIntentRequired',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_GUILD_PRESENCES_INTENT_REQUIRED',
    'gateway.guildPresencesIntentRequired',
  );
  applyOptionalInteger(env, overrides, 'DISCORD_SHARD_COUNT', 'gateway.shardCount');
  applyOptionalList(env, overrides, 'DISCORD_SHARD_IDS', 'gateway.shardIds');
}

function applyInteractionsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_INTERACTIONS_ENABLED',
    'interactions.enabled',
  );
  applyOptionalString(
    env,
    overrides,
    'DISCORD_INTERACTIONS_ENDPOINT_URL',
    'interactions.endpointUrl',
  );
  applyOptionalString(
    env,
    overrides,
    'DISCORD_INTERACTIONS_ENDPOINT_PATH',
    'interactions.endpointPath',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_VERIFY_SIGNATURES',
    'interactions.verifySignatures',
  );
  applyOptionalInteger(
    env,
    overrides,
    'DISCORD_INITIAL_RESPONSE_TIMEOUT_MS',
    'interactions.initialResponseTimeoutMs',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_DEFERRED_RESPONSES_ENABLED',
    'interactions.deferredResponsesEnabled',
  );
}

function applyCommandOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const command of knownDiscordCommands) {
    applyKnownCommandOverride(env, overrides, command);
  }

  const extraCommands = getEnvList(env, 'DISCORD_COMMANDS');

  for (const commandName of extraCommands) {
    const normalizedCommandName = normalizeConfigKey(commandName);

    if (normalizedCommandName.length === 0) {
      continue;
    }

    const envPrefix = `DISCORD_COMMAND_${normalizedCommandName.toUpperCase()}`;

    applyKnownCommandOverride(env, overrides, {
      key: normalizedCommandName,
      envPrefix,
    });
  }
}

function applyKnownCommandOverride(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  command: KnownDiscordCommand,
): void {
  const basePath = `commands.${command.key}`;
  const prefix = command.envPrefix;

  const name = getEnv(env, `${prefix}_NAME`);
  const description = getEnv(env, `${prefix}_DESCRIPTION`);
  const type = getEnv(env, `${prefix}_TYPE`);
  const scope = getEnv(env, `${prefix}_SCOPE`);
  const guildId = getEnv(env, `${prefix}_GUILD_ID`);
  const enabled = getEnvBoolean(env, `${prefix}_ENABLED`);
  const nsfw = getEnvBoolean(env, `${prefix}_NSFW`);
  const defaultMemberPermissions = getEnv(
    env,
    `${prefix}_DEFAULT_MEMBER_PERMISSIONS`,
  );
  const dmPermission = getEnvBoolean(env, `${prefix}_DM_PERMISSION`);
  const requiredPermissions = getEnvList(env, `${prefix}_REQUIRED_PERMISSIONS`);
  const requiredFeatureFlags = getEnvList(
    env,
    `${prefix}_REQUIRED_FEATURE_FLAGS`,
  );

  if (
    name === undefined &&
    description === undefined &&
    type === undefined &&
    scope === undefined &&
    guildId === undefined &&
    enabled === undefined &&
    nsfw === undefined &&
    defaultMemberPermissions === undefined &&
    dmPermission === undefined &&
    requiredPermissions.length === 0 &&
    requiredFeatureFlags.length === 0
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, name ?? command.key);

  if (description !== undefined) {
    setDeepValue(overrides, `${basePath}.description`, description);
  }

  if (type !== undefined) {
    setDeepValue(overrides, `${basePath}.type`, type);
  }

  if (scope !== undefined) {
    setDeepValue(overrides, `${basePath}.scope`, scope);
  }

  if (guildId !== undefined) {
    setDeepValue(overrides, `${basePath}.guildId`, guildId);
  }

  if (enabled !== undefined) {
    setDeepValue(overrides, `${basePath}.enabled`, enabled);
  }

  if (nsfw !== undefined) {
    setDeepValue(overrides, `${basePath}.nsfw`, nsfw);
  }

  if (defaultMemberPermissions !== undefined) {
    setDeepValue(
      overrides,
      `${basePath}.defaultMemberPermissions`,
      defaultMemberPermissions,
    );
  }

  if (dmPermission !== undefined) {
    setDeepValue(overrides, `${basePath}.dmPermission`, dmPermission);
  }

  if (requiredPermissions.length > 0) {
    setDeepValue(overrides, `${basePath}.requiredPermissions`, requiredPermissions);
  }

  if (requiredFeatureFlags.length > 0) {
    setDeepValue(
      overrides,
      `${basePath}.requiredFeatureFlags`,
      requiredFeatureFlags,
    );
  }
}

function applyGuildOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const guildIds = getEnvList(env, 'DISCORD_GUILD_IDS');

  for (const guildId of guildIds) {
    const key = normalizeConfigKey(guildId);

    if (key.length === 0) {
      continue;
    }

    const prefix = `DISCORD_GUILD_${key.toUpperCase()}`;
    const basePath = `guilds.${key}`;

    setDeepValue(overrides, `${basePath}.id`, guildId);

    applyOptionalString(env, overrides, `${prefix}_NAME`, `${basePath}.name`);
    applyOptionalBoolean(env, overrides, `${prefix}_ENABLED`, `${basePath}.enabled`);
    applyOptionalBoolean(
      env,
      overrides,
      `${prefix}_COMMANDS_ENABLED`,
      `${basePath}.commandsEnabled`,
    );
    applyOptionalBoolean(
      env,
      overrides,
      `${prefix}_MODERATION_ENABLED`,
      `${basePath}.moderationEnabled`,
    );
    applyOptionalString(
      env,
      overrides,
      `${prefix}_DEFAULT_CHANNEL_ID`,
      `${basePath}.defaultChannelId`,
    );
    applyOptionalString(
      env,
      overrides,
      `${prefix}_ADMIN_ROLE_ID`,
      `${basePath}.adminRoleId`,
    );
    applyOptionalList(
      env,
      overrides,
      `${prefix}_STAFF_ROLE_IDS`,
      `${basePath}.staffRoleIds`,
    );
  }
}

function applyWebhookOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const webhook of knownDiscordWebhooks) {
    applyKnownWebhookOverride(env, overrides, webhook);
  }

  const extraWebhooks = getEnvList(env, 'DISCORD_WEBHOOKS');

  for (const webhookName of extraWebhooks) {
    const normalizedWebhookName = normalizeConfigKey(webhookName);

    if (normalizedWebhookName.length === 0) {
      continue;
    }

    const envPrefix = `DISCORD_WEBHOOK_${normalizedWebhookName.toUpperCase()}`;

    applyKnownWebhookOverride(env, overrides, {
      key: normalizedWebhookName,
      envPrefix,
    });
  }
}

function applyKnownWebhookOverride(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  webhook: KnownDiscordWebhook,
): void {
  const basePath = `webhooks.${webhook.key}`;
  const prefix = webhook.envPrefix;

  const name = getEnv(env, `${prefix}_NAME`);
  const enabled = getEnvBoolean(env, `${prefix}_ENABLED`);
  const purpose = getEnv(env, `${prefix}_PURPOSE`);
  const channelId = getEnv(env, `${prefix}_CHANNEL_ID`);
  const urlRef = getEnv(env, `${prefix}_URL_REF`);
  const username = getEnv(env, `${prefix}_USERNAME`);
  const avatarUrl = getEnv(env, `${prefix}_AVATAR_URL`);
  const allowedEvents = getEnvList(env, `${prefix}_ALLOWED_EVENTS`);

  if (
    name === undefined &&
    enabled === undefined &&
    purpose === undefined &&
    channelId === undefined &&
    urlRef === undefined &&
    username === undefined &&
    avatarUrl === undefined &&
    allowedEvents.length === 0
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, name ?? webhook.key);

  if (enabled !== undefined) {
    setDeepValue(overrides, `${basePath}.enabled`, enabled);
  }

  if (purpose !== undefined) {
    setDeepValue(overrides, `${basePath}.purpose`, purpose);
  }

  if (channelId !== undefined) {
    setDeepValue(overrides, `${basePath}.channelId`, channelId);
  }

  if (urlRef !== undefined) {
    setDeepValue(overrides, `${basePath}.urlRef`, urlRef);
  }

  if (username !== undefined) {
    setDeepValue(overrides, `${basePath}.username`, username);
  }

  if (avatarUrl !== undefined) {
    setDeepValue(overrides, `${basePath}.avatarUrl`, avatarUrl);
  }

  if (allowedEvents.length > 0) {
    setDeepValue(overrides, `${basePath}.allowedEvents`, allowedEvents);
  }
}

function applyEventOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  for (const event of knownDiscordEvents) {
    applyKnownEventOverride(env, overrides, event);
  }
}

function applyKnownEventOverride(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  event: KnownDiscordEvent,
): void {
  const basePath = `events.${event.key}`;
  const prefix = event.envPrefix;

  const name = getEnv(env, `${prefix}_NAME`);
  const enabled = getEnvBoolean(env, `${prefix}_ENABLED`);
  const delivery = getEnv(env, `${prefix}_DELIVERY`);
  const queue = getEnv(env, `${prefix}_QUEUE`);
  const requiredIntents = getEnvList(env, `${prefix}_REQUIRED_INTENTS`);
  const requiredFeatureFlags = getEnvList(
    env,
    `${prefix}_REQUIRED_FEATURE_FLAGS`,
  );

  if (
    name === undefined &&
    enabled === undefined &&
    delivery === undefined &&
    queue === undefined &&
    requiredIntents.length === 0 &&
    requiredFeatureFlags.length === 0
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, name ?? event.key);

  if (enabled !== undefined) {
    setDeepValue(overrides, `${basePath}.enabled`, enabled);
  }

  if (delivery !== undefined) {
    setDeepValue(overrides, `${basePath}.delivery`, delivery);
  }

  if (queue !== undefined) {
    setDeepValue(overrides, `${basePath}.queue`, queue);
  }

  if (requiredIntents.length > 0) {
    setDeepValue(overrides, `${basePath}.requiredIntents`, requiredIntents);
  }

  if (requiredFeatureFlags.length > 0) {
    setDeepValue(
      overrides,
      `${basePath}.requiredFeatureFlags`,
      requiredFeatureFlags,
    );
  }
}

function applyModerationOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_MODERATION_ENABLED', 'moderation.enabled');
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_MODERATION_REQUIRE_CONFIRMATION',
    'moderation.requireConfirmation',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_MODERATION_AUDIT_LOG_ENABLED',
    'moderation.auditLogEnabled',
  );
  applyOptionalString(
    env,
    overrides,
    'DISCORD_MODERATION_AUDIT_CHANNEL',
    'moderation.auditChannel',
  );
  applyOptionalList(
    env,
    overrides,
    'DISCORD_MODERATION_REQUIRED_PERMISSIONS',
    'moderation.requiredPermissions',
  );
}

function applyTicketsOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalBoolean(env, overrides, 'DISCORD_TICKETS_ENABLED', 'tickets.enabled');
  applyOptionalString(
    env,
    overrides,
    'DISCORD_TICKETS_CATEGORY_ID',
    'tickets.categoryId',
  );
  applyOptionalString(
    env,
    overrides,
    'DISCORD_TICKETS_TRANSCRIPT_CHANNEL_ID',
    'tickets.transcriptChannelId',
  );
  applyOptionalList(
    env,
    overrides,
    'DISCORD_TICKETS_STAFF_ROLE_IDS',
    'tickets.staffRoleIds',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'DISCORD_TICKETS_EXTERNAL_TRANSCRIPT_STORAGE_ENABLED',
    'tickets.externalTranscriptStorageEnabled',
  );
}

function applyRequiredSecretOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyOptionalList(
    env,
    overrides,
    'DISCORD_REQUIRED_SECRET_REFS',
    'requiredSecretRefs',
  );
}

function applyDerivedDiscordOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  const appUrl =
    getEnv(env, 'APP_URL') ??
    getEnv(env, 'NEXT_PUBLIC_APP_URL') ??
    getEnv(env, 'PUBLIC_APP_URL');

  if (
    appUrl !== undefined &&
    getEnv(env, 'DISCORD_REDIRECT_URI') === undefined
  ) {
    setDeepValue(overrides, 'oauth.redirectUri', `${appUrl}/api/auth/callback/discord`);
  }

  if (
    appUrl !== undefined &&
    getEnv(env, 'DISCORD_INTERACTIONS_ENDPOINT_URL') === undefined &&
    hasInteractionsSignal(env)
  ) {
    setDeepValue(
      overrides,
      'interactions.endpointUrl',
      `${appUrl}/api/discord/interactions`,
    );
  }

  if (hasInteractionsSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'authMode', 'interactions-endpoint');
    setDeepValue(overrides, 'runtimeMode', 'http-interactions');
    setDeepValue(overrides, 'interactions.enabled', true);
    setDeepValue(overrides, 'interactions.verifySignatures', true);
  }

  if (hasGatewaySignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'authMode', 'bot-token');
    setDeepValue(overrides, 'runtimeMode', 'gateway');
    setDeepValue(overrides, 'gateway.enabled', true);
    setDeepValue(overrides, 'bot.enabled', true);
  }

  if (hasBotSignal(env)) {
    setDeepValue(overrides, 'enabled', true);
    setDeepValue(overrides, 'bot.enabled', true);

    if (getEnv(env, 'DISCORD_BOT_TOKEN_REF') === undefined) {
      setDeepValue(overrides, 'bot.tokenRef', 'DISCORD_BOT_TOKEN');
    }
  }

  if (getEnv(env, 'DISCORD_CLIENT_SECRET_REF') === undefined) {
    setDeepValue(overrides, 'oauth.clientSecretRef', 'DISCORD_CLIENT_SECRET');
  }

  const publicKey = getEnv(env, 'DISCORD_PUBLIC_KEY');

  if (publicKey !== undefined) {
    setDeepValue(overrides, 'bot.publicKey', publicKey);
  }

  const applicationId =
    getEnv(env, 'DISCORD_APPLICATION_ID') ??
    getEnv(env, 'NEXT_PUBLIC_DISCORD_APPLICATION_ID');

  if (applicationId !== undefined) {
    setDeepValue(overrides, 'bot.applicationId', applicationId);
  }
}

function hasInteractionsSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'DISCORD_INTERACTIONS_ENDPOINT_URL') ||
      getEnv(env, 'DISCORD_INTERACTIONS_ENDPOINT_PATH') ||
      getEnv(env, 'DISCORD_PUBLIC_KEY') ||
      getEnvBoolean(env, 'DISCORD_INTERACTIONS_ENABLED') === true,
  );
}

function hasGatewaySignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'DISCORD_GATEWAY_INTENTS') ||
      getEnv(env, 'DISCORD_SHARD_COUNT') ||
      getEnv(env, 'DISCORD_SHARD_IDS') ||
      getEnvBoolean(env, 'DISCORD_GATEWAY_ENABLED') === true,
  );
}

function hasBotSignal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'DISCORD_APPLICATION_ID') ||
      getEnv(env, 'NEXT_PUBLIC_DISCORD_APPLICATION_ID') ||
      getEnv(env, 'DISCORD_BOT_USER_ID') ||
      getEnv(env, 'DISCORD_BOT_TOKEN_REF') ||
      getEnv(env, 'DISCORD_BOT_TOKEN') ||
      getEnv(env, 'DISCORD_BOT_SCOPES'),
  );
}

function applyOptionalString(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvBoolean(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvInteger(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalList(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvList(env, envKey);

  if (value.length > 0) {
    setDeepValue(target, path, value);
  }
}

function normalizeConfigKey(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}
import { z } from 'zod';

import type { DiscordConfig } from '../types/discord';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const discordAuthModeSchema = nonEmptyStringSchema;

export const discordRuntimeModeSchema = nonEmptyStringSchema;

export const discordCommandScopeSchema = nonEmptyStringSchema;

export const discordCommandTypeSchema = nonEmptyStringSchema;

export const discordEventDeliverySchema = nonEmptyStringSchema;

export const discordChannelPurposeSchema = nonEmptyStringSchema;

export const discordOAuth2Schema = z
  .object({
    clientId: optionalNonEmptyStringSchema,

    clientSecretRef: optionalNonEmptyStringSchema,

    redirectUri: optionalUrlSchema,

    scopes: stringArraySchema.optional(),
  })
  .strict();

export const discordBotSchema = z
  .object({
    enabled: z.boolean().default(false),

    applicationId: optionalNonEmptyStringSchema,

    botUserId: optionalNonEmptyStringSchema,

    publicKey: optionalNonEmptyStringSchema,

    tokenRef: optionalNonEmptyStringSchema,

    permissions: optionalNonEmptyStringSchema,

    scopes: stringArraySchema.optional(),

    publicInstall: z.boolean().optional(),

    requireCodeGrant: z.boolean().optional(),
  })
  .strict();

export const discordGatewayIntentSchema = z
  .object({
    enabled: z.boolean().default(false),

    intents: stringArraySchema,

    messageContentIntentRequired: z.boolean().optional(),

    guildMembersIntentRequired: z.boolean().optional(),

    guildPresencesIntentRequired: z.boolean().optional(),

    shardCount: z.number().int().positive().optional(),

    shardIds: z.array(z.number().int().nonnegative()).optional(),
  })
  .strict();

export const discordInteractionsSchema = z
  .object({
    enabled: z.boolean().default(false),

    endpointUrl: optionalUrlSchema,

    endpointPath: optionalNonEmptyStringSchema,

    verifySignatures: z.boolean().default(true),

    initialResponseTimeoutMs: z.number().int().positive().optional(),

    deferredResponsesEnabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (!value.endpointUrl && !value.endpointPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpointUrl'],
        message:
          'endpointUrl or endpointPath is required when Discord interactions are enabled.',
      });
    }

    if (value.endpointPath && !value.endpointPath.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endpointPath'],
        message: 'endpointPath must start with "/".',
      });
    }
  });

export const discordCommandSchema = z
  .object({
    name: nonEmptyStringSchema,

    description: optionalNonEmptyStringSchema,

    type: discordCommandTypeSchema.default('slash'),

    scope: discordCommandScopeSchema.default('global'),

    guildId: optionalNonEmptyStringSchema,

    enabled: z.boolean().default(true),

    nsfw: z.boolean().optional(),

    defaultMemberPermissions: optionalNonEmptyStringSchema,

    dmPermission: z.boolean().optional(),

    requiredPermissions: stringArraySchema.optional(),

    requiredFeatureFlags: stringArraySchema.optional(),
  })
  .strict();

export const discordGuildSchema = z
  .object({
    name: nonEmptyStringSchema,

    id: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    commandScope: discordCommandScopeSchema.optional(),

    roles: z.record(z.string(), z.string()).optional(),

    channels: z.record(discordChannelPurposeSchema, z.string()).optional(),

    featureFlags: z.record(z.string(), z.boolean()).optional(),
  })
  .strict();

export const discordWebhookSchema = z
  .object({
    name: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    purpose: discordChannelPurposeSchema.default('general'),

    channelId: optionalNonEmptyStringSchema,

    urlRef: optionalNonEmptyStringSchema,

    username: optionalNonEmptyStringSchema,

    avatarUrl: optionalUrlSchema,

    allowedEvents: stringArraySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled && !value.urlRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['urlRef'],
        message:
          'urlRef is required when a Discord webhook is enabled. Store a secret reference, not the raw webhook URL.',
      });
    }
  });

export const discordEventSchema = z
  .object({
    name: nonEmptyStringSchema,

    enabled: z.boolean().default(true),

    delivery: discordEventDeliverySchema.default('disabled'),

    queue: optionalNonEmptyStringSchema,

    requiredIntents: stringArraySchema.optional(),

    requiredFeatureFlags: stringArraySchema.optional(),
  })
  .strict();

export const discordModerationSchema = z
  .object({
    enabled: z.boolean().default(false),

    requireConfirmation: z.boolean().optional(),

    auditLogEnabled: z.boolean().optional(),

    auditChannel: optionalNonEmptyStringSchema,

    requiredPermissions: stringArraySchema.optional(),
  })
  .strict();

export const discordTicketsSchema = z
  .object({
    enabled: z.boolean().default(false),

    categoryId: optionalNonEmptyStringSchema,

    transcriptChannelId: optionalNonEmptyStringSchema,

    staffRoleIds: stringArraySchema.optional(),

    externalTranscriptStorageEnabled: z.boolean().optional(),
  })
  .strict();

export const discordSchema = z
  .object({
    enabled: z.boolean().default(false),

    authMode: discordAuthModeSchema.default('none'),

    runtimeMode: discordRuntimeModeSchema.default('http-interactions'),

    apiBaseUrl: optionalUrlSchema,

    webBaseUrl: optionalUrlSchema,

    oauth: discordOAuth2Schema.optional(),

    bot: discordBotSchema.default({
      enabled: false,
    }),

    gateway: discordGatewayIntentSchema.optional(),

    interactions: discordInteractionsSchema.optional(),

    commands: z.record(z.string(), discordCommandSchema).optional(),

    guilds: z.record(z.string(), discordGuildSchema).optional(),

    webhooks: z.record(z.string(), discordWebhookSchema).optional(),

    events: z.record(z.string(), discordEventSchema).optional(),

    moderation: discordModerationSchema.optional(),

    tickets: discordTicketsSchema.optional(),

    requiredSecretRefs: stringArraySchema.optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (value.authMode === 'bot-token' && value.bot.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bot', 'enabled'],
        message: 'bot.enabled must be true when Discord authMode is bot-token.',
      });
    }

    if (value.authMode === 'bot-token' && !value.bot.tokenRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bot', 'tokenRef'],
        message:
          'bot.tokenRef is required when Discord authMode is bot-token.',
      });
    }

    if (
      value.authMode === 'interactions-endpoint' &&
      value.interactions?.enabled !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interactions', 'enabled'],
        message:
          'interactions.enabled must be true when Discord authMode is interactions-endpoint.',
      });
    }

    if (value.runtimeMode === 'gateway' && value.gateway?.enabled !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gateway', 'enabled'],
        message: 'gateway.enabled must be true when runtimeMode is gateway.',
      });
    }

    if (
      value.runtimeMode === 'http-interactions' &&
      value.interactions?.enabled !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['interactions', 'enabled'],
        message:
          'interactions.enabled should be true when runtimeMode is http-interactions.',
      });
    }

    if (value.commands) {
      for (const [commandKey, command] of Object.entries(value.commands)) {
        if (command.name !== commandKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['commands', commandKey, 'name'],
            message:
              'Discord command name should match its registry key for predictable lookups.',
          });
        }
      }
    }

    if (value.guilds) {
      for (const [guildKey, guild] of Object.entries(value.guilds)) {
        if (guild.name !== guildKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['guilds', guildKey, 'name'],
            message:
              'Discord guild name should match its registry key for predictable lookups.',
          });
        }
      }
    }

    if (value.webhooks) {
      for (const [webhookKey, webhook] of Object.entries(value.webhooks)) {
        if (webhook.name !== webhookKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['webhooks', webhookKey, 'name'],
            message:
              'Discord webhook name should match its registry key for predictable lookups.',
          });
        }
      }
    }

    if (value.events) {
      for (const [eventKey, event] of Object.entries(value.events)) {
        if (event.name !== eventKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['events', eventKey, 'name'],
            message:
              'Discord event name should match its registry key for predictable lookups.',
          });
        }

        if (event.delivery === 'queue' && !event.queue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['events', eventKey, 'queue'],
            message: 'queue is required when Discord event delivery is queue.',
          });
        }
      }
    }
  });

export type DiscordConfigInput = z.input<typeof discordSchema>;

export type DiscordConfigOutput = z.output<typeof discordSchema>;

export function parseDiscordConfig(input: DiscordConfigInput): DiscordConfig {
  return discordSchema.parse(input) as DiscordConfig;
}

export function safeParseDiscordConfig(input: unknown) {
  return discordSchema.safeParse(input);
}
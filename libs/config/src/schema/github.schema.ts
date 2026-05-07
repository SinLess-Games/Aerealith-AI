import { z } from 'zod';

import type { GithubConfig } from '../types/github';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const urlSchema = z.string().trim().url();

const optionalUrlSchema = urlSchema.optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

export const githubAuthModeSchema = z.union([
  z.literal('oauth-app'),
  z.literal('github-app'),
  z.literal('personal-access-token'),
  z.literal('none'),
  nonEmptyStringSchema,
]);

export const githubRepositoryVisibilitySchema = z.union([
  z.literal('public'),
  z.literal('private'),
  z.literal('internal'),
  nonEmptyStringSchema,
]);

export const githubPermissionLevelSchema = z.union([
  z.literal('none'),
  z.literal('read'),
  z.literal('write'),
  z.literal('admin'),
  nonEmptyStringSchema,
]);

export const githubRepositorySchema = z
  .object({
    owner: nonEmptyStringSchema,

    name: nonEmptyStringSchema,

    fullName: nonEmptyStringSchema,

    url: urlSchema,

    defaultBranch: optionalNonEmptyStringSchema,

    visibility: githubRepositoryVisibilitySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedFullName = `${value.owner}/${value.name}`;

    if (value.fullName !== expectedFullName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fullName'],
        message: `fullName must match owner/name. Expected "${expectedFullName}".`,
      });
    }
  });

export const githubOAuthAppSchema = z
  .object({
    clientId: optionalNonEmptyStringSchema,

    clientSecretRef: optionalNonEmptyStringSchema,

    redirectUri: optionalUrlSchema,

    scopes: stringArraySchema.optional(),
  })
  .strict();

export const githubAppSchema = z
  .object({
    appId: optionalNonEmptyStringSchema,

    clientId: optionalNonEmptyStringSchema,

    clientSecretRef: optionalNonEmptyStringSchema,

    installationId: optionalNonEmptyStringSchema,

    privateKeyRef: optionalNonEmptyStringSchema,

    webhookSecretRef: optionalNonEmptyStringSchema,

    permissions: z.record(z.string(), githubPermissionLevelSchema).optional(),
  })
  .strict();

export const githubApiSchema = z
  .object({
    baseUrl: urlSchema.default('https://api.github.com'),

    webUrl: urlSchema.default('https://github.com'),

    tokenRef: optionalNonEmptyStringSchema,

    timeoutMs: z.number().int().positive().optional(),

    retriesEnabled: z.boolean().optional(),
  })
  .strict();

export const githubSchema = z
  .object({
    enabled: z.boolean().default(false),

    authMode: githubAuthModeSchema.default('none'),

    clientId: optionalNonEmptyStringSchema,

    redirectUri: optionalUrlSchema,

    repoUrl: urlSchema,

    repository: githubRepositorySchema,

    oauth: githubOAuthAppSchema.optional(),

    app: githubAppSchema.optional(),

    api: githubApiSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.repository.url !== value.repoUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repoUrl'],
        message: 'repoUrl must match repository.url.',
      });
    }

    if (value.oauth?.clientId && value.clientId && value.oauth.clientId !== value.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oauth', 'clientId'],
        message: 'oauth.clientId must match clientId when both are provided.',
      });
    }

    if (
      value.oauth?.redirectUri &&
      value.redirectUri &&
      value.oauth.redirectUri !== value.redirectUri
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oauth', 'redirectUri'],
        message: 'oauth.redirectUri must match redirectUri when both are provided.',
      });
    }

    if (!value.enabled || value.authMode === 'none') {
      return;
    }

    if (value.authMode === 'oauth-app') {
      if (!value.oauth?.clientId && !value.clientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['oauth', 'clientId'],
          message: 'oauth.clientId or clientId is required when authMode is oauth-app.',
        });
      }

      if (!value.oauth?.clientSecretRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['oauth', 'clientSecretRef'],
          message:
            'oauth.clientSecretRef is required when authMode is oauth-app. Store a secret reference, not the raw secret.',
        });
      }

      if (!value.oauth?.redirectUri && !value.redirectUri) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['oauth', 'redirectUri'],
          message:
            'oauth.redirectUri or redirectUri is strongly recommended for GitHub OAuth apps.',
        });
      }
    }

    if (value.authMode === 'github-app') {
      if (!value.app?.appId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['app', 'appId'],
          message: 'app.appId is required when authMode is github-app.',
        });
      }

      if (!value.app?.installationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['app', 'installationId'],
          message:
            'app.installationId is required for repository automation using a GitHub App installation.',
        });
      }

      if (!value.app?.privateKeyRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['app', 'privateKeyRef'],
          message:
            'app.privateKeyRef is required when authMode is github-app. Store a secret reference, not the raw private key.',
        });
      }
    }

    if (value.authMode === 'personal-access-token' && !value.api?.tokenRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['api', 'tokenRef'],
        message:
          'api.tokenRef is required when authMode is personal-access-token. Store a secret reference, not the raw token.',
      });
    }
  }) satisfies z.ZodType<GithubConfig>;

export type GithubConfigInput = z.input<typeof githubSchema>;

export type GithubConfigOutput = z.output<typeof githubSchema>;

export function parseGithubConfig(input: GithubConfigInput): GithubConfig {
  return githubSchema.parse(input);
}

export function safeParseGithubConfig(input: unknown) {
  return githubSchema.safeParse(input);
}
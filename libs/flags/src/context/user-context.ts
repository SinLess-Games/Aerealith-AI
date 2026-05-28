import { FLAGS_DEFAULT_ENVIRONMENT } from '../constants';

import type {
  BuildFlagContextOptions,
  FlagContextInput,
  FlagEnvironment,
  FlagEvaluationContext,
  FlagJsonValue,
  RequiredFlagEvaluationContext,
} from '../types';

import {
  buildFlagEvaluationContext,
  buildRequiredFlagEvaluationContext,
  buildUserTargetingKey,
  mergeFlagEvaluationContexts,
  normalizeTargetingKey,
} from './evaluation-context';

export type FlagUserId = string | number;

export type FlagUserRole = string;

export type FlagUserPlan = string;

export type FlagUserInput = {
  readonly id?: FlagUserId;
  readonly userId?: FlagUserId;
  readonly targetingKey?: string;

  readonly anonymousId?: string;
  readonly sessionId?: string;

  readonly email?: string;
  readonly username?: string;
  readonly displayName?: string;
  readonly name?: string;

  readonly role?: FlagUserRole;
  readonly roles?: readonly FlagUserRole[];
  readonly plan?: FlagUserPlan;

  readonly country?: string;
  readonly locale?: string;
  readonly timezone?: string;

  readonly organizationId?: string | number;
  readonly workspaceId?: string | number;
  readonly accountId?: string | number;

  readonly authenticated?: boolean;
  readonly internal?: boolean;
  readonly admin?: boolean;

  readonly createdAt?: string | Date;
  readonly updatedAt?: string | Date;
  readonly lastLoginAt?: string | Date;

  readonly metadata?: Record<string, unknown>;
};

export type FlagOrganizationInput = {
  readonly id?: string | number;
  readonly organizationId?: string | number;
  readonly name?: string;
  readonly slug?: string;
  readonly plan?: string;
  readonly role?: string;
  readonly metadata?: Record<string, unknown>;
};

export type FlagWorkspaceInput = {
  readonly id?: string | number;
  readonly workspaceId?: string | number;
  readonly name?: string;
  readonly slug?: string;
  readonly environment?: FlagEnvironment;
  readonly metadata?: Record<string, unknown>;
};

export type BuildUserFlagContextOptions = BuildFlagContextOptions & {
  readonly includeUserProfile?: boolean;
  readonly includeEmail?: boolean;
  readonly includeMetadata?: boolean;
  readonly organization?: FlagOrganizationInput;
  readonly workspace?: FlagWorkspaceInput;
};

export function buildUserFlagEvaluationContext(
  user: FlagUserInput | undefined | null,
  options: BuildUserFlagContextOptions = {},
): FlagEvaluationContext {
  if (!user) {
    return buildFlagEvaluationContext({}, options);
  }

  const userId = getUserId(user);
  const targetingKey =
    normalizeTargetingKey(user.targetingKey) ??
    (userId ? buildUserTargetingKey(String(userId)) : undefined);

  const organizationContext = buildOrganizationContext(options.organization);
  const workspaceContext = buildWorkspaceContext(options.workspace);

  const userContext = buildFlagEvaluationContext(
    {
      targetingKey,
      userId: stringifyOptional(userId),
      anonymousId: user.anonymousId,
      sessionId: user.sessionId,

      email: options.includeEmail ? normalizeOptionalString(user.email) : undefined,
      username: normalizeOptionalString(user.username),
      displayName: options.includeUserProfile
        ? normalizeOptionalString(user.displayName ?? user.name)
        : undefined,

      role: normalizeOptionalString(user.role ?? getPrimaryRole(user.roles)),
      roles: normalizeStringArray(user.roles),
      plan: normalizeOptionalString(user.plan),

      country: normalizeOptionalString(user.country),
      locale: normalizeOptionalString(user.locale),
      timezone: normalizeOptionalString(user.timezone),

      organizationId: stringifyOptional(user.organizationId),
      workspaceId: stringifyOptional(user.workspaceId),
      accountId: stringifyOptional(user.accountId),

      authenticated: user.authenticated ?? Boolean(userId),
      internal: user.internal,
      admin: user.admin,

      createdAt: normalizeDate(user.createdAt),
      updatedAt: normalizeDate(user.updatedAt),
      lastLoginAt: normalizeDate(user.lastLoginAt),

      ...(options.includeMetadata ? prefixMetadata('user', user.metadata) : {}),
    },
    {
      ...options,
      environment: options.environment ?? FLAGS_DEFAULT_ENVIRONMENT,
    },
  );

  return mergeFlagEvaluationContexts(
    organizationContext,
    workspaceContext,
    userContext,
  );
}

export function buildRequiredUserFlagEvaluationContext(
  user: FlagUserInput,
  options: BuildUserFlagContextOptions = {},
): RequiredFlagEvaluationContext {
  return buildRequiredFlagEvaluationContext(
    buildUserFlagEvaluationContext(user, options),
    options,
  );
}

export function buildAnonymousUserFlagEvaluationContext(
  input: Pick<FlagUserInput, 'anonymousId' | 'sessionId' | 'country' | 'locale'> = {},
  options: BuildUserFlagContextOptions = {},
): FlagEvaluationContext {
  return buildFlagEvaluationContext(
    {
      anonymousId: input.anonymousId,
      sessionId: input.sessionId,
      country: input.country,
      locale: input.locale,
      authenticated: false,
    },
    {
      includeAnonymousContext: true,
      ...options,
    },
  );
}

export function buildAuthenticatedUserFlagEvaluationContext(
  user: FlagUserInput,
  options: BuildUserFlagContextOptions = {},
): RequiredFlagEvaluationContext {
  const userId = getUserId(user);

  if (!userId && !user.targetingKey) {
    throw new Error(
      'Authenticated feature flag context requires user.id, user.userId, or user.targetingKey.',
    );
  }

  return buildRequiredUserFlagEvaluationContext(
    {
      ...user,
      authenticated: true,
    },
    options,
  );
}

export function buildOrganizationContext(
  organization: FlagOrganizationInput | undefined,
): FlagEvaluationContext {
  if (!organization) {
    return {};
  }

  const organizationId = organization.organizationId ?? organization.id;

  return buildFlagEvaluationContext({
    organizationId: stringifyOptional(organizationId),
    organizationName: normalizeOptionalString(organization.name),
    organizationSlug: normalizeOptionalString(organization.slug),
    organizationPlan: normalizeOptionalString(organization.plan),
    organizationRole: normalizeOptionalString(organization.role),
    ...prefixMetadata('organization', organization.metadata),
  });
}

export function buildWorkspaceContext(
  workspace: FlagWorkspaceInput | undefined,
): FlagEvaluationContext {
  if (!workspace) {
    return {};
  }

  const workspaceId = workspace.workspaceId ?? workspace.id;

  return buildFlagEvaluationContext({
    workspaceId: stringifyOptional(workspaceId),
    workspaceName: normalizeOptionalString(workspace.name),
    workspaceSlug: normalizeOptionalString(workspace.slug),
    workspaceEnvironment: normalizeOptionalString(workspace.environment),
    ...prefixMetadata('workspace', workspace.metadata),
  });
}

export function getUserId(user: FlagUserInput): FlagUserId | undefined {
  return user.userId ?? user.id;
}

export function getUserTargetingKey(user: FlagUserInput): string | undefined {
  const explicitTargetingKey = normalizeTargetingKey(user.targetingKey);

  if (explicitTargetingKey) {
    return explicitTargetingKey;
  }

  const userId = getUserId(user);

  if (!userId) {
    return undefined;
  }

  return buildUserTargetingKey(String(userId));
}

export function getPrimaryRole(
  roles: readonly string[] | undefined,
): string | undefined {
  if (!roles || roles.length === 0) {
    return undefined;
  }

  return roles.find((role) => role.trim().length > 0);
}

export function mergeUserFlagContext(
  user: FlagUserInput | undefined | null,
  context: FlagContextInput = {},
  options: BuildUserFlagContextOptions = {},
): FlagEvaluationContext {
  return mergeFlagEvaluationContexts(
    buildUserFlagEvaluationContext(user, options),
    context,
  );
}

export function requireUserTargetingKey(user: FlagUserInput): string {
  const targetingKey = getUserTargetingKey(user);

  if (!targetingKey) {
    throw new Error(
      'Feature flag user context requires user.id, user.userId, or targetingKey.',
    );
  }

  return targetingKey;
}

export function isAuthenticatedFlagUser(
  user: FlagUserInput | undefined | null,
): user is FlagUserInput {
  if (!user) {
    return false;
  }

  return Boolean(user.authenticated ?? getUserId(user) ?? user.targetingKey);
}

export function isAnonymousFlagUser(
  user: FlagUserInput | undefined | null,
): boolean {
  if (!user) {
    return true;
  }

  return !isAuthenticatedFlagUser(user);
}

function stringifyOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(values: readonly string[] | undefined): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDate(value: string | Date | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function prefixMetadata(
  prefix: string,
  metadata: Record<string, unknown> | undefined,
): Record<string, FlagJsonValue | undefined> {
  if (!metadata) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      `${prefix}.${key}`,
      normalizeMetadataValue(value),
    ]),
  );
}

function normalizeMetadataValue(value: unknown): FlagJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeMetadataValue(item))
      .filter((item): item is FlagJsonValue => item !== undefined);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entryValue]) => [key, normalizeMetadataValue(entryValue)])
        .filter(
          (entry): entry is [string, FlagJsonValue] => entry[1] !== undefined,
        ),
    );
  }

  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
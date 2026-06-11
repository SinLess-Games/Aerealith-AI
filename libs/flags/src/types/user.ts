// libs/flags/src/types/user.ts

import type {
  BuildFlagContextOptions,
  FlagEnvironment,
  FlagJsonValue,
} from './core';

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

export type UserFlagMetadataInput = Record<string, FlagJsonValue | undefined>;

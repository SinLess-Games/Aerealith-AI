import { getEntityManager } from '@aerealith-ai/db';
import { createLogger } from '@aerealith-ai/observability';

import { createAccountRepository } from './repositories/account.repository';
import { createSessionRepository } from './repositories/session.repository';
import { createUserRepository } from './repositories/user.repository';
import { createVerificationTokenRepository } from './repositories/verification-token.repository';

import { createAuthApp } from './app';
import { createAuthService } from './services/auth.service';
import { createEmailVerificationMailerFromEnv } from './services/email-verification-email.service';
import { createPasswordService } from './services/password.service';
import { createSessionService } from './services/session.service';
import { createTokenService } from './services/token.service';
import { createVerificationTokenService } from './services/verification-token.service';

const DEFAULT_AUTH_TOKEN_SECRET =
  'dev-only-change-me-auth-secret-minimum-32-characters';

const DEFAULT_SERVICE_NAME = 'aerealith-auth-service';
const DEFAULT_SERVICE_VERSION = '0.0.1';

export const AUTH_MAIN_DEFAULTS = {
  serviceName: DEFAULT_SERVICE_NAME,
  serviceVersion: DEFAULT_SERVICE_VERSION,
  tokenSecret: DEFAULT_AUTH_TOKEN_SECRET,
} as const;

export const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const parseBoolean = (
  value: string | undefined,
): boolean | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
};

export const pruneUndefined = <T extends Record<string, unknown>>(
  value: T,
): Partial<T> => {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
};

export const getAuthTokenSecret = (env: { AUTH_TOKEN_SECRET?: string }): string => {
  return env.AUTH_TOKEN_SECRET ?? DEFAULT_AUTH_TOKEN_SECRET;
};

export const createConfiguredAuthApp = async (
  env: {
    AUTH_TOKEN_SECRET?: string;
    AUTH_TOKEN_ISSUER?: string;
    AUTH_TOKEN_AUDIENCE?: string;
    AUTH_ACCESS_TOKEN_TTL_SECONDS?: string;
    AUTH_REFRESH_TOKEN_TTL_SECONDS?: string;
    AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS?: string;
    AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS?: string;
    AUTH_SESSION_TTL_SECONDS?: string;
    AUTH_REFRESH_TOKEN_ROTATION_ENABLED?: string;
    AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE?: string;
    SERVICE_NAME?: string;
    SERVICE_VERSION?: string;
    LOKI_API_TOKEN?: string;
  },
): Promise<ReturnType<typeof createAuthApp>> => {

  const em = await getEntityManager();
  const userRepository = createUserRepository(em);
  const accountRepository = createAccountRepository(em);
  const sessionRepository = createSessionRepository(em);
  const verificationTokenRepository = createVerificationTokenRepository(em);

  const tokenService = createTokenService({
    config: pruneUndefined({
      secret: getAuthTokenSecret(env),
      issuer: env.AUTH_TOKEN_ISSUER,
      audience: env.AUTH_TOKEN_AUDIENCE,
      accessTokenTtlSeconds: parsePositiveInteger(env.AUTH_ACCESS_TOKEN_TTL_SECONDS),
      refreshTokenTtlSeconds: parsePositiveInteger(env.AUTH_REFRESH_TOKEN_TTL_SECONDS),
      emailVerificationTokenTtlSeconds: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS),
      passwordResetTokenTtlSeconds: parsePositiveInteger(env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS),
    }),
  });

  const sessionService = createSessionService({
    repository: sessionRepository,
    tokenService,
    config: pruneUndefined({
      sessionTtlSeconds: parsePositiveInteger(env.AUTH_SESSION_TTL_SECONDS),
      refreshTokenRotationEnabled: parseBoolean(env.AUTH_REFRESH_TOKEN_ROTATION_ENABLED),
    }),
  });

  const verificationTokenService = createVerificationTokenService({
    repository: verificationTokenRepository,
    tokenService,
    config: pruneUndefined({
      emailVerificationTokenTtlSeconds: parsePositiveInteger(env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS),
      passwordResetTokenTtlSeconds: parsePositiveInteger(env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS),
      revokeExistingTokensOnCreate: parseBoolean(env.AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE),
    }),
  });

  const authService = createAuthService({
    userRepository,
    accountRepository,
    sessionService,
    verificationTokenService,
    passwordService: createPasswordService(),
  });

  return createAuthApp({
    authService,
    authContext: {
      userRepository,
      sessionRepository,
      tokenService,
    },
    emailVerificationMailer: createEmailVerificationMailerFromEnv(),
    logger: createLogger({ service: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName, env }),
    serviceName: env.SERVICE_NAME ?? AUTH_MAIN_DEFAULTS.serviceName,
    version: env.SERVICE_VERSION ?? AUTH_MAIN_DEFAULTS.serviceVersion,
  });
};
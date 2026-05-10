import type { Hono } from 'hono';

import { getEntityManager } from '@helix-ai/db';

import { createAccountRepository } from './repositories/account.repository';
import { createSessionRepository } from './repositories/session.repository';
import { createUserRepository } from './repositories/user.repository';
import { createVerificationTokenRepository } from './repositories/verification-token.repository';

import { createAuthApp } from './app';
import { createAuthService } from './services/auth.service';
import { createPasswordService } from './services/password.service';
import { createSessionService } from './services/session.service';
import { createTokenService } from './services/token.service';
import { createVerificationTokenService } from './services/verification-token.service';

import type { AuthHonoEnv } from './types/auth-context.type';

export type AuthWorkerBindings = {
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
};

const DEFAULT_AUTH_TOKEN_SECRET =
  'dev-only-change-me-auth-secret-minimum-32-characters';

const DEFAULT_SERVICE_NAME = 'helix-auth-service';
const DEFAULT_SERVICE_VERSION = '0.0.1';

let cachedAppPromise: Promise<Hono<AuthHonoEnv>> | undefined;

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
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

const getAuthTokenSecret = (env: AuthWorkerBindings): string => {
  return env.AUTH_TOKEN_SECRET ?? DEFAULT_AUTH_TOKEN_SECRET;
};

const createConfiguredAuthApp = async (
  env: AuthWorkerBindings,
): Promise<Hono<AuthHonoEnv>> => {
  const em = await getEntityManager();

  const userRepository = createUserRepository(em);
  const accountRepository = createAccountRepository(em);
  const sessionRepository = createSessionRepository(em);
  const verificationTokenRepository = createVerificationTokenRepository(em);

  const tokenService = createTokenService({
    config: {
      secret: getAuthTokenSecret(env),
      issuer: env.AUTH_TOKEN_ISSUER,
      audience: env.AUTH_TOKEN_AUDIENCE,
      accessTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      ),
      refreshTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      ),
      emailVerificationTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
      ),
      passwordResetTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
      ),
    },
  });

  const passwordService = createPasswordService();

  const sessionService = createSessionService({
    repository: sessionRepository,
    tokenService,
    config: {
      sessionTtlSeconds: parsePositiveInteger(env.AUTH_SESSION_TTL_SECONDS),
      refreshTokenRotationEnabled: parseBoolean(
        env.AUTH_REFRESH_TOKEN_ROTATION_ENABLED,
      ),
    },
  });

  const verificationTokenService = createVerificationTokenService({
    repository: verificationTokenRepository,
    tokenService,
    config: {
      emailVerificationTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
      ),
      passwordResetTokenTtlSeconds: parsePositiveInteger(
        env.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
      ),
      revokeExistingTokensOnCreate: parseBoolean(
        env.AUTH_REVOKE_EXISTING_VERIFICATION_TOKENS_ON_CREATE,
      ),
    },
  });

  const authService = createAuthService({
    userRepository,
    accountRepository,
    sessionService,
    verificationTokenService,
    passwordService,
  });

  return createAuthApp({
    authService,
    authContext: {
      userRepository,
      sessionRepository,
      tokenService,
    },
    serviceName: env.SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
    version: env.SERVICE_VERSION ?? DEFAULT_SERVICE_VERSION,
  });
};

const getApp = async (env: AuthWorkerBindings): Promise<Hono<AuthHonoEnv>> => {
  cachedAppPromise ??= createConfiguredAuthApp(env);

  return cachedAppPromise;
};

export default {
  async fetch(
    request: Request,
    env: AuthWorkerBindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const app = await getApp(env);

    return app.fetch(request, env, ctx);
  },
};

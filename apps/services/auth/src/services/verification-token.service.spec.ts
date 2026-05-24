import { describe, expect, it, vi } from 'vitest';

import type { User, UserVerificationToken } from '@aerealith-ai/db';
import { AuthVerificationSchemas } from '@aerealith-ai/contracts';

import {
  createVerificationTokenService,
  type VerificationTokenServiceConfig,
} from './verification-token.service';
import type { VerificationTokenRepository } from '../repositories/verification-token.repository';
import type { TokenService } from './token.service';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthTokenString,
  type AuthVerificationTokenClaims,
} from '../types/auth-token.type';

const { AUTH_VERIFICATION_TOKEN_TYPE } = AuthVerificationSchemas;

const TEST_EMAIL_VERIFICATION_TOKEN =
  'test.email-verification.token' as AuthTokenString;
const TEST_PASSWORD_RESET_TOKEN =
  'test.password-reset.token' as AuthTokenString;

const TEST_TOKEN_HASH = 'hashed-token-value';
const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_TOKEN_ID = 'verification_token_123';

const TEST_NOW = new Date('2026-05-09T12:00:00.000Z');
const TEST_EXPIRES_AT = new Date('2026-05-10T12:00:00.000Z');
const TEST_EXPIRES_SECONDS = Math.floor(TEST_EXPIRES_AT.getTime() / 1000);

type MockVerificationTokenRepository = {
  createAndFlush: ReturnType<typeof vi.fn>;
  findActiveByTokenHash: ReturnType<typeof vi.fn>;
  consumeVerificationToken: ReturnType<typeof vi.fn>;
  revokeByTokenHash: ReturnType<typeof vi.fn>;
  revokeUserVerificationTokens: ReturnType<typeof vi.fn>;
  revokeEmailVerificationTokens: ReturnType<typeof vi.fn>;
  revokePasswordResetTokens: ReturnType<typeof vi.fn>;
  findByUserId: ReturnType<typeof vi.fn>;
  findLatestEmailVerificationToken: ReturnType<typeof vi.fn>;
  findLatestPasswordResetToken: ReturnType<typeof vi.fn>;
  deleteVerificationToken: ReturnType<typeof vi.fn>;
};

type MockTokenService = {
  issueEmailVerificationToken: ReturnType<typeof vi.fn>;
  issuePasswordResetToken: ReturnType<typeof vi.fn>;
  assertVerificationToken: ReturnType<typeof vi.fn>;
};

const TEST_SERVICE_CONFIG: VerificationTokenServiceConfig = {
  emailVerificationTokenTtlSeconds: 86_400,
  passwordResetTokenTtlSeconds: 3_600,
  revokeExistingTokensOnCreate: true,
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    ...overrides,
  } as unknown as User;
};

const createVerificationTokenEntity = (
  overrides: Partial<Record<string, unknown>> = {},
): UserVerificationToken => {
  return {
    id: TEST_TOKEN_ID,
    user: {
      id: TEST_USER_ID,
      username: TEST_USERNAME,
      email: TEST_EMAIL,
    },
    tokenHash: TEST_TOKEN_HASH,
    token: TEST_TOKEN_HASH,
    type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    identifier: TEST_EMAIL,
    expiresAt: TEST_EXPIRES_AT,
    expires: TEST_EXPIRES_AT,
    consumedAt: null,
    revokedAt: null,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  } as unknown as UserVerificationToken;
};

const createVerificationClaims = (
  overrides: Partial<AuthVerificationTokenClaims> = {},
): AuthVerificationTokenClaims => {
  return {
    id: 'verification_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
    scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: Math.floor(TEST_NOW.getTime() / 1000),
    expiresAt: TEST_EXPIRES_SECONDS,
    ...overrides,
  };
};

const createMockRepository = (): MockVerificationTokenRepository => {
  return {
    createAndFlush: vi.fn(async (input: Record<string, unknown>) => {
      return createVerificationTokenEntity({
        user: input.user,
        tokenHash: input.tokenHash,
        token: input.tokenHash,
        type: input.type,
        purpose: input.type,
        identifier: input.identifier,
        expiresAt: input.expiresAt,
        expires: input.expiresAt,
      });
    }),

    findActiveByTokenHash: vi.fn(async (tokenHash: string, type: string) => {
      return createVerificationTokenEntity({
        tokenHash,
        token: tokenHash,
        type,
        purpose: type,
      });
    }),

    consumeVerificationToken: vi.fn(async (input: Record<string, unknown>) => {
      return createVerificationTokenEntity({
        tokenHash: input.tokenHash,
        token: input.tokenHash,
        type: input.type,
        purpose: input.type,
        consumedAt: input.consumedAt,
      });
    }),

    revokeByTokenHash: vi.fn(async (tokenHash: string, revokedAt: Date) => {
      return createVerificationTokenEntity({
        tokenHash,
        token: tokenHash,
        revokedAt,
      });
    }),

    revokeUserVerificationTokens: vi.fn(async () => {
      return 2;
    }),

    revokeEmailVerificationTokens: vi.fn(async () => {
      return 1;
    }),

    revokePasswordResetTokens: vi.fn(async () => {
      return 1;
    }),

    findByUserId: vi.fn(async () => {
      return [createVerificationTokenEntity()];
    }),

    findLatestEmailVerificationToken: vi.fn(async () => {
      return createVerificationTokenEntity({
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        purpose: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      });
    }),

    findLatestPasswordResetToken: vi.fn(async () => {
      return createVerificationTokenEntity({
        type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        purpose: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
      });
    }),

    deleteVerificationToken: vi.fn(async () => {
      return true;
    }),
  };
};

const createMockTokenService = (): MockTokenService => {
  return {
    issueEmailVerificationToken: vi.fn(async () => {
      return TEST_EMAIL_VERIFICATION_TOKEN;
    }),

    issuePasswordResetToken: vi.fn(async () => {
      return TEST_PASSWORD_RESET_TOKEN;
    }),

    assertVerificationToken: vi.fn(
      async (token: AuthTokenString, expectedType: string) => {
        return createVerificationClaims({
          type: expectedType as AuthVerificationTokenClaims['type'],
          id:
            token === TEST_PASSWORD_RESET_TOKEN
              ? 'password_reset_jti_123'
              : 'email_verification_jti_123',
        });
      },
    ),
  };
};

const createTestVerificationTokenService = ({
  repository = createMockRepository(),
  tokenService = createMockTokenService(),
  config = {},
}: {
  repository?: MockVerificationTokenRepository;
  tokenService?: MockTokenService;
  config?: Partial<VerificationTokenServiceConfig>;
} = {}) => {
  const service = createVerificationTokenService({
    repository: repository as unknown as VerificationTokenRepository,
    tokenService: tokenService as unknown as TokenService,
    config: {
      ...TEST_SERVICE_CONFIG,
      ...config,
    },
  });

  return {
    service,
    repository,
    tokenService,
  };
};

describe('VerificationTokenService', () => {
  describe('constructor', () => {
    it('creates a service with valid config', () => {
      const { service } = createTestVerificationTokenService();

      expect(service).toBeDefined();
    });

    it('throws when email verification token TTL is invalid', () => {
      expect(() => {
        createTestVerificationTokenService({
          config: {
            emailVerificationTokenTtlSeconds: 0,
          },
        });
      }).toThrow('Email verification token TTL must be a positive integer.');
    });

    it('throws when password reset token TTL is invalid', () => {
      expect(() => {
        createTestVerificationTokenService({
          config: {
            passwordResetTokenTtlSeconds: 0,
          },
        });
      }).toThrow('Password reset token TTL must be a positive integer.');
    });
  });

  describe('createEmailVerificationToken', () => {
    it('revokes existing tokens, issues a token, hashes it, stores it, and returns the raw token only in the response', async () => {
      const user = createTestUser();
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const result = await service.createEmailVerificationToken({
        user,
      });

      expect(repository.revokeEmailVerificationTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
      );

      expect(tokenService.issueEmailVerificationToken).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        scopes: undefined,
      });

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_EMAIL_VERIFICATION_TOKEN,
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(repository.createAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          tokenHash: expect.any(String),
          type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          identifier: TEST_EMAIL,
          expiresAt: TEST_EXPIRES_AT,
        }),
      );

      const createCall = repository.createAndFlush.mock.calls[0]?.[0] as {
        tokenHash: string;
      };

      expect(createCall.tokenHash).not.toBe(TEST_EMAIL_VERIFICATION_TOKEN);

      expect(result).toMatchObject({
        response: {
          created: true,
          type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          token: TEST_EMAIL_VERIFICATION_TOKEN,
          expiresAt: TEST_EXPIRES_AT.toISOString(),
        },
        token: TEST_EMAIL_VERIFICATION_TOKEN,
        tokenHash: expect.any(String),
        claims: {
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
        },
      });

      expect(result.tokenHash).not.toBe(TEST_EMAIL_VERIFICATION_TOKEN);
    });

    it('does not revoke existing email verification tokens when revokeExisting is false', async () => {
      const user = createTestUser();
      const { service, repository } = createTestVerificationTokenService();

      await service.createEmailVerificationToken({
        user,
        revokeExisting: false,
      });

      expect(repository.revokeEmailVerificationTokens).not.toHaveBeenCalled();
    });

    it('uses the provided username, identifier, scopes, and expiresAt', async () => {
      const user = createTestUser();
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const expiresAt = new Date('2026-05-11T12:00:00.000Z');

      await service.createEmailVerificationToken({
        user,
        username: 'custom-user',
        identifier: 'custom@example.com',
        scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
        expiresAt,
      });

      expect(tokenService.issueEmailVerificationToken).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: 'custom-user',
        scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
      });

      expect(repository.createAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'custom@example.com',
          expiresAt,
        }),
      );
    });

    it('throws when the user id is missing', async () => {
      const user = createTestUser({
        id: undefined,
      });
      const { service } = createTestVerificationTokenService();

      await expect(
        service.createEmailVerificationToken({
          user,
        }),
      ).rejects.toThrow();
    });

    it('throws when the username is missing', async () => {
      const user = createTestUser({
        username: undefined,
      });
      const { service } = createTestVerificationTokenService();

      await expect(
        service.createEmailVerificationToken({
          user,
        }),
      ).rejects.toThrow();
    });

    it('throws when the email identifier is missing', async () => {
      const user = createTestUser({
        email: undefined,
      });
      const { service } = createTestVerificationTokenService();

      await expect(
        service.createEmailVerificationToken({
          user,
        }),
      ).rejects.toThrow();
    });
  });

  describe('createPasswordResetToken', () => {
    it('revokes existing tokens, issues a password reset token, hashes it, stores it, and returns the raw token only in the response', async () => {
      const user = createTestUser();
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const result = await service.createPasswordResetToken({
        user,
      });

      expect(repository.revokePasswordResetTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
      );

      expect(tokenService.issuePasswordResetToken).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        username: TEST_USERNAME,
        scopes: undefined,
      });

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_PASSWORD_RESET_TOKEN,
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );

      expect(repository.createAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          user,
          tokenHash: expect.any(String),
          type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
          identifier: TEST_EMAIL,
          expiresAt: TEST_EXPIRES_AT,
        }),
      );

      expect(result).toMatchObject({
        response: {
          created: true,
          type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
          token: TEST_PASSWORD_RESET_TOKEN,
          expiresAt: TEST_EXPIRES_AT.toISOString(),
        },
        token: TEST_PASSWORD_RESET_TOKEN,
        tokenHash: expect.any(String),
        claims: {
          userId: TEST_USER_ID,
          username: TEST_USERNAME,
          type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
        },
      });

      expect(result.tokenHash).not.toBe(TEST_PASSWORD_RESET_TOKEN);
    });

    it('does not revoke existing password reset tokens when revokeExisting is false', async () => {
      const user = createTestUser();
      const { service, repository } = createTestVerificationTokenService();

      await service.createPasswordResetToken({
        user,
        revokeExisting: false,
      });

      expect(repository.revokePasswordResetTokens).not.toHaveBeenCalled();
    });
  });

  describe('consumeEmailVerificationToken', () => {
    it('verifies, hashes, consumes, and returns the verification token', async () => {
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const result = await service.consumeEmailVerificationToken({
        token: TEST_EMAIL_VERIFICATION_TOKEN,
      });

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_EMAIL_VERIFICATION_TOKEN,
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(repository.consumeVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: expect.any(String),
          type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
          consumedAt: expect.any(Date),
        }),
      );

      expect(result).toMatchObject({
        consumed: true,
        type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
        consumedAt: expect.any(String),
        claims: {
          type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
          userId: TEST_USER_ID,
        },
      });
    });

    it('throws when the repository cannot consume the token', async () => {
      const repository = createMockRepository();

      repository.consumeVerificationToken.mockResolvedValueOnce(null);

      const { service } = createTestVerificationTokenService({
        repository,
      });

      await expect(
        service.consumeEmailVerificationToken({
          token: TEST_EMAIL_VERIFICATION_TOKEN,
        }),
      ).rejects.toThrow();
    });
  });

  describe('consumePasswordResetToken', () => {
    it('verifies, hashes, consumes, and returns the password reset token', async () => {
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const result = await service.consumePasswordResetToken({
        token: TEST_PASSWORD_RESET_TOKEN,
      });

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_PASSWORD_RESET_TOKEN,
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );

      expect(repository.consumeVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: expect.any(String),
          type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
          consumedAt: expect.any(Date),
        }),
      );

      expect(result).toMatchObject({
        consumed: true,
        type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
        claims: {
          type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
          userId: TEST_USER_ID,
        },
      });
    });

    it('throws when the repository cannot consume the token', async () => {
      const repository = createMockRepository();

      repository.consumeVerificationToken.mockResolvedValueOnce(null);

      const { service } = createTestVerificationTokenService({
        repository,
      });

      await expect(
        service.consumePasswordResetToken({
          token: TEST_PASSWORD_RESET_TOKEN,
        }),
      ).rejects.toThrow();
    });
  });

  describe('assertEmailVerificationToken', () => {
    it('verifies the JWT and confirms an active stored token exists', async () => {
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const claims = await service.assertEmailVerificationToken(
        TEST_EMAIL_VERIFICATION_TOKEN,
      );

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_EMAIL_VERIFICATION_TOKEN,
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(repository.findActiveByTokenHash).toHaveBeenCalledWith(
        expect.any(String),
        AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(claims).toMatchObject({
        userId: TEST_USER_ID,
        type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      });
    });

    it('throws when the active stored token cannot be found', async () => {
      const repository = createMockRepository();

      repository.findActiveByTokenHash.mockResolvedValueOnce(null);

      const { service } = createTestVerificationTokenService({
        repository,
      });

      await expect(
        service.assertEmailVerificationToken(TEST_EMAIL_VERIFICATION_TOKEN),
      ).rejects.toThrow();
    });
  });

  describe('assertPasswordResetToken', () => {
    it('verifies the JWT and confirms an active stored token exists', async () => {
      const { service, repository, tokenService } =
        createTestVerificationTokenService();

      const claims = await service.assertPasswordResetToken(
        TEST_PASSWORD_RESET_TOKEN,
      );

      expect(tokenService.assertVerificationToken).toHaveBeenCalledWith(
        TEST_PASSWORD_RESET_TOKEN,
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );

      expect(repository.findActiveByTokenHash).toHaveBeenCalledWith(
        expect.any(String),
        AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
      );

      expect(claims).toMatchObject({
        userId: TEST_USER_ID,
        type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
      });
    });

    it('throws when the active stored token cannot be found', async () => {
      const repository = createMockRepository();

      repository.findActiveByTokenHash.mockResolvedValueOnce(null);

      const { service } = createTestVerificationTokenService({
        repository,
      });

      await expect(
        service.assertPasswordResetToken(TEST_PASSWORD_RESET_TOKEN),
      ).rejects.toThrow();
    });
  });

  describe('revokeVerificationToken', () => {
    it('hashes and revokes a token', async () => {
      const { service, repository } = createTestVerificationTokenService();
      const revokedAt = new Date('2026-05-09T13:00:00.000Z');

      const result = await service.revokeVerificationToken({
        token: TEST_EMAIL_VERIFICATION_TOKEN,
        revokedAt,
      });

      expect(repository.revokeByTokenHash).toHaveBeenCalledWith(
        expect.any(String),
        revokedAt,
      );

      expect(result).toMatchObject({
        revoked: true,
        revokedAt: revokedAt.toISOString(),
        verificationToken: expect.any(Object),
      });
    });

    it('returns revoked false when no token was revoked', async () => {
      const repository = createMockRepository();

      repository.revokeByTokenHash.mockResolvedValueOnce(null);

      const { service } = createTestVerificationTokenService({
        repository,
      });

      const result = await service.revokeVerificationToken({
        token: TEST_EMAIL_VERIFICATION_TOKEN,
      });

      expect(result).toMatchObject({
        revoked: false,
        revokedAt: expect.any(String),
      });

      expect(result.verificationToken).toBeUndefined();
    });
  });

  describe('bulk revoke helpers', () => {
    it('revokes user verification tokens', async () => {
      const { service, repository } = createTestVerificationTokenService();
      const revokedAt = new Date('2026-05-09T13:00:00.000Z');

      await expect(
        service.revokeUserVerificationTokens({
          userId: TEST_USER_ID,
          type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
          revokedAt,
        }),
      ).resolves.toBe(2);

      expect(repository.revokeUserVerificationTokens).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        revokedAt,
      });
    });

    it('revokes email verification tokens', async () => {
      const { service, repository } = createTestVerificationTokenService();

      await expect(
        service.revokeEmailVerificationTokens(TEST_USER_ID),
      ).resolves.toBe(1);

      expect(repository.revokeEmailVerificationTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
    });

    it('revokes password reset tokens', async () => {
      const { service, repository } = createTestVerificationTokenService();

      await expect(
        service.revokePasswordResetTokens(TEST_USER_ID),
      ).resolves.toBe(1);

      expect(repository.revokePasswordResetTokens).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
    });
  });

  describe('lookup helpers', () => {
    it('lists user verification tokens', async () => {
      const { service, repository } = createTestVerificationTokenService();

      const result = await service.listUserVerificationTokens(TEST_USER_ID, {
        includeConsumed: true,
        includeExpired: true,
        includeRevoked: true,
      });

      expect(repository.findByUserId).toHaveBeenCalledWith(TEST_USER_ID, {
        includeConsumed: true,
        includeExpired: true,
        includeRevoked: true,
      });

      expect(result.verificationTokens).toHaveLength(1);
    });

    it('finds the latest email verification token', async () => {
      const { service, repository } = createTestVerificationTokenService();

      const result =
        await service.findLatestEmailVerificationToken(TEST_USER_ID);

      expect(repository.findLatestEmailVerificationToken).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
      expect(result).toEqual(expect.any(Object));
    });

    it('finds the latest password reset token', async () => {
      const { service, repository } = createTestVerificationTokenService();

      const result = await service.findLatestPasswordResetToken(TEST_USER_ID);

      expect(repository.findLatestPasswordResetToken).toHaveBeenCalledWith(
        TEST_USER_ID,
      );
      expect(result).toEqual(expect.any(Object));
    });

    it('deletes a verification token', async () => {
      const { service, repository } = createTestVerificationTokenService();

      await expect(
        service.deleteVerificationToken(TEST_TOKEN_ID),
      ).resolves.toBe(true);

      expect(repository.deleteVerificationToken).toHaveBeenCalledWith(
        TEST_TOKEN_ID,
      );
    });
  });

  describe('hashVerificationToken', () => {
    it('hashes verification tokens deterministically', async () => {
      const { service } = createTestVerificationTokenService();

      const firstHash = await service.hashVerificationToken(
        TEST_EMAIL_VERIFICATION_TOKEN,
      );
      const secondHash = await service.hashVerificationToken(
        TEST_EMAIL_VERIFICATION_TOKEN,
      );

      expect(firstHash).toBe(secondHash);
      expect(firstHash).not.toBe(TEST_EMAIL_VERIFICATION_TOKEN);
      expect(firstHash.length).toBeGreaterThan(20);
    });

    it('produces different hashes for different tokens', async () => {
      const { service } = createTestVerificationTokenService();

      const firstHash = await service.hashVerificationToken(
        TEST_EMAIL_VERIFICATION_TOKEN,
      );
      const secondHash = await service.hashVerificationToken(
        TEST_PASSWORD_RESET_TOKEN,
      );

      expect(firstHash).not.toBe(secondHash);
    });
  });

  describe('expiration helpers', () => {
    it('returns an email verification expiration ISO string', () => {
      const { service } = createTestVerificationTokenService();

      const expiresAt = service.getEmailVerificationTokenExpiresAt();

      expect(new Date(expiresAt).toString()).not.toBe('Invalid Date');
    });

    it('returns a password reset expiration ISO string', () => {
      const { service } = createTestVerificationTokenService();

      const expiresAt = service.getPasswordResetTokenExpiresAt();

      expect(new Date(expiresAt).toString()).not.toBe('Invalid Date');
    });
  });
});

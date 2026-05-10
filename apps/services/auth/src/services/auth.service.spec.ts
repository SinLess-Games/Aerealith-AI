import { describe, expect, it, vi } from 'vitest';

import type { User } from '@helix-ai/db';
import { AUTH_ACCOUNT_PROVIDER, AUTH_USER_STATUS } from '@helix-ai/contracts';

import {
  createAuthService,
  type AuthService,
  type AuthRequestMetadata,
} from './auth.service';
import type { AccountRepository } from '../repositories/account.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { SessionService } from './session.service';
import type { VerificationTokenService } from './verification-token.service';
import type { PasswordService } from './password.service';
import {
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthAccessTokenClaims,
  type AuthRefreshTokenClaims,
  type AuthTokenPair,
  type AuthTokenString,
} from '../types/auth-token.type';

const TEST_USER_ID = 'user_123';
const TEST_USERNAME = 'sinless777';
const TEST_EMAIL = 'sinless777@example.com';
const TEST_DISPLAY_NAME = 'Sinless777';
const TEST_PASSWORD = 'ValidPass1!';
const TEST_NEW_PASSWORD = 'NewValidPass1!';
const TEST_PASSWORD_HASH = 'hashed-password-value';
const TEST_NEXT_PASSWORD_HASH = 'next-hashed-password-value';
const TEST_SESSION_ID = 'session_123';
const TEST_ACCESS_TOKEN = 'test.access.token' as AuthTokenString;
const TEST_REFRESH_TOKEN = 'test.refresh.token' as AuthTokenString;
const TEST_EMAIL_VERIFICATION_TOKEN =
  'test.email-verification.token' as AuthTokenString;
const TEST_PASSWORD_RESET_TOKEN =
  'test.password-reset.token' as AuthTokenString;

const TEST_CREATED_AT = new Date('2026-05-09T12:00:00.000Z');
const TEST_UPDATED_AT = new Date('2026-05-09T12:30:00.000Z');
const TEST_VERIFIED_AT = new Date('2026-05-09T13:00:00.000Z');
const TEST_CHANGED_AT = new Date('2026-05-09T14:00:00.000Z');

type MockUserRepository = {
  assertUsernameAvailable: ReturnType<typeof vi.fn>;
  assertEmailAvailable: ReturnType<typeof vi.fn>;
  createUserWithDefaults: ReturnType<typeof vi.fn>;
  findByUsernameOrEmail: ReturnType<typeof vi.fn>;
  findByUsername: ReturnType<typeof vi.fn>;
  findByEmail: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  touchUpdatedAt: ReturnType<typeof vi.fn>;
  updateEmailVerification: ReturnType<typeof vi.fn>;
};

type MockAccountRepository = {
  existsCredentialsAccount: ReturnType<typeof vi.fn>;
  createCredentialsAndFlush: ReturnType<typeof vi.fn>;
  findOneByUserIdAndProvider: ReturnType<typeof vi.fn>;
};

type MockSessionService = {
  createSession: ReturnType<typeof vi.fn>;
  refreshSession: ReturnType<typeof vi.fn>;
  revokeCurrentSession: ReturnType<typeof vi.fn>;
  revokeSession: ReturnType<typeof vi.fn>;
  revokeUserSessions: ReturnType<typeof vi.fn>;
  listUserSessions: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
};

type MockVerificationTokenService = {
  createEmailVerificationToken: ReturnType<typeof vi.fn>;
  consumeEmailVerificationToken: ReturnType<typeof vi.fn>;
  createPasswordResetToken: ReturnType<typeof vi.fn>;
  consumePasswordResetToken: ReturnType<typeof vi.fn>;
  revokeVerificationToken: ReturnType<typeof vi.fn>;
};

type MockPasswordService = {
  hashPassword: ReturnType<typeof vi.fn>;
  verifyPassword: ReturnType<typeof vi.fn>;
  needsRehash: ReturnType<typeof vi.fn>;
  assertPasswordMatches: ReturnType<typeof vi.fn>;
};

type AuthRegisterInput = Parameters<AuthService['register']>[0];
type AuthLoginInput = Parameters<AuthService['login']>[0];
type AuthRefreshInput = Parameters<AuthService['refresh']>[0];
type AuthLogoutInput = Parameters<AuthService['logout']>[0];
type AuthCreateEmailVerificationTokenInput = Parameters<
  AuthService['createEmailVerificationToken']
>[2];
type AuthVerifyEmailInput = Parameters<AuthService['verifyEmail']>[2];
type AuthPasswordChangeInput = Parameters<AuthService['changePassword']>[2];
type AuthPasswordResetTokenInput = Parameters<
  AuthService['createPasswordResetToken']
>[0];
type AuthPasswordResetInput = Parameters<AuthService['resetPassword']>[0];

const TEST_METADATA: AuthRequestMetadata = {
  deviceName: 'Firefox on Linux',
  userAgent: 'Mozilla/5.0',
  ipAddress: '127.0.0.1',
};

const createTestUser = (
  overrides: Partial<Record<string, unknown>> = {},
): User => {
  return {
    id: TEST_USER_ID,
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    displayName: TEST_DISPLAY_NAME,
    emailVerified: false,
    status: AUTH_USER_STATUS.ACTIVE,
    hashedPassword: TEST_PASSWORD_HASH,
    passwordHash: TEST_PASSWORD_HASH,
    createdAt: TEST_CREATED_AT,
    updatedAt: TEST_UPDATED_AT,
    ...overrides,
  } as unknown as User;
};

const createAccessClaims = (
  overrides: Partial<AuthAccessTokenClaims> = {},
): AuthAccessTokenClaims => {
  return {
    id: 'access_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.ACCESS,
    scopes: [
      AUTH_TOKEN_SCOPE.AUTH_READ,
      AUTH_TOKEN_SCOPE.USER_READ,
      AUTH_TOKEN_SCOPE.SESSION_READ,
    ],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_777_980_900,
    ...overrides,
  };
};

const createRefreshClaims = (
  overrides: Partial<AuthRefreshTokenClaims> = {},
): AuthRefreshTokenClaims => {
  return {
    id: 'refresh_jti_123',
    userId: TEST_USER_ID,
    username: TEST_USERNAME,
    sessionId: TEST_SESSION_ID,
    type: AUTH_TOKEN_TYPE.REFRESH,
    scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE, AUTH_TOKEN_SCOPE.SESSION_WRITE],
    issuer: 'helix-auth-test',
    audience: 'helix-api-test',
    issuedAt: 1_777_980_000,
    expiresAt: 1_780_572_000,
    ...overrides,
  };
};

const createTokenPair = (
  overrides: Partial<AuthTokenPair> = {},
): AuthTokenPair => {
  return {
    accessToken: TEST_ACCESS_TOKEN,
    refreshToken: TEST_REFRESH_TOKEN,
    accessTokenExpiresAt: '2026-05-09T12:15:00.000Z',
    refreshTokenExpiresAt: '2026-06-08T12:00:00.000Z',
    tokenType: 'Bearer',
    ...overrides,
  };
};

const createSessionResponse = (
  overrides: Partial<Record<string, unknown>> = {},
) => {
  return {
    id: TEST_SESSION_ID,
    userId: TEST_USER_ID,
    deviceName: TEST_METADATA.deviceName,
    userAgent: TEST_METADATA.userAgent,
    ipAddress: TEST_METADATA.ipAddress,
    createdAt: TEST_CREATED_AT.toISOString(),
    updatedAt: TEST_UPDATED_AT.toISOString(),
    lastSeenAt: TEST_UPDATED_AT.toISOString(),
    expiresAt: '2026-06-08T12:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
};

const createSessionCreateResult = () => {
  return {
    session: createSessionResponse(),
    tokens: createTokenPair(),
    accessClaims: createAccessClaims(),
    refreshClaims: createRefreshClaims(),
  };
};

const createVerificationTokenCreateResult = (
  token: AuthTokenString,
  type: string,
) => {
  return {
    response: {
      created: true,
      type,
      token,
      expiresAt: '2026-05-10T12:00:00.000Z',
    },
    token,
    tokenHash: 'hashed-verification-token',
    claims: {
      id: 'verification_jti_123',
      userId: TEST_USER_ID,
      username: TEST_USERNAME,
      type,
      scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
      issuer: 'helix-auth-test',
      audience: 'helix-api-test',
      issuedAt: 1_777_980_000,
      expiresAt: 1_778_066_400,
    },
    verificationToken: {
      id: 'verification_token_123',
    },
  };
};

const createVerificationTokenConsumeResult = (
  type: string,
  userId = TEST_USER_ID,
) => {
  return {
    consumed: true,
    type,
    consumedAt: TEST_VERIFIED_AT.toISOString(),
    claims: {
      id: 'verification_jti_123',
      userId,
      username: TEST_USERNAME,
      type,
      scopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
      issuer: 'helix-auth-test',
      audience: 'helix-api-test',
      issuedAt: 1_777_980_000,
      expiresAt: 1_778_066_400,
    },
    verificationToken: {
      id: 'verification_token_123',
    },
  };
};

const createRegisterInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthRegisterInput => {
  return {
    username: TEST_USERNAME,
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    displayName: TEST_DISPLAY_NAME,
    timezone: 'America/Boise',
    locale: 'en-US',
    ...overrides,
  } as unknown as AuthRegisterInput;
};

const createLoginInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthLoginInput => {
  return {
    identifier: TEST_USERNAME,
    password: TEST_PASSWORD,
    deviceName: TEST_METADATA.deviceName,
    userAgent: TEST_METADATA.userAgent,
    ipAddress: TEST_METADATA.ipAddress,
    ...overrides,
  } as unknown as AuthLoginInput;
};

const createRefreshInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthRefreshInput => {
  return {
    refreshToken: TEST_REFRESH_TOKEN,
    sessionId: TEST_SESSION_ID,
    rotate: true,
    deviceName: TEST_METADATA.deviceName,
    userAgent: TEST_METADATA.userAgent,
    ipAddress: TEST_METADATA.ipAddress,
    ...overrides,
  } as unknown as AuthRefreshInput;
};

const createLogoutInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthLogoutInput => {
  return {
    refreshToken: TEST_REFRESH_TOKEN,
    sessionId: TEST_SESSION_ID,
    allSessions: false,
    ...overrides,
  } as unknown as AuthLogoutInput;
};

const createEmailVerificationTokenInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthCreateEmailVerificationTokenInput => {
  return {
    email: TEST_EMAIL,
    ...overrides,
  } as unknown as AuthCreateEmailVerificationTokenInput;
};

const createVerifyEmailInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthVerifyEmailInput => {
  return {
    token: TEST_EMAIL_VERIFICATION_TOKEN,
    ...overrides,
  } as unknown as AuthVerifyEmailInput;
};

const createPasswordChangeInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthPasswordChangeInput => {
  return {
    currentPassword: TEST_PASSWORD,
    newPassword: TEST_NEW_PASSWORD,
    ...overrides,
  } as unknown as AuthPasswordChangeInput;
};

const createPasswordResetTokenInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthPasswordResetTokenInput => {
  return {
    username: TEST_USERNAME,
    ...overrides,
  } as unknown as AuthPasswordResetTokenInput;
};

const createPasswordResetInput = (
  overrides: Partial<Record<string, unknown>> = {},
): AuthPasswordResetInput => {
  return {
    token: TEST_PASSWORD_RESET_TOKEN,
    newPassword: TEST_NEW_PASSWORD,
    ...overrides,
  } as unknown as AuthPasswordResetInput;
};

const createMockUserRepository = (): MockUserRepository => {
  const user = createTestUser();

  return {
    assertUsernameAvailable: vi.fn(async () => true),
    assertEmailAvailable: vi.fn(async () => true),

    createUserWithDefaults: vi.fn(async (input: Record<string, unknown>) => {
      return {
        user: createTestUser({
          username: input.username,
          email: input.email,
          displayName: input.displayName,
          emailVerified: input.emailVerified,
          status: input.status,
        }),
        profile: {
          id: 'profile_123',
        },
        settings: {
          id: 'settings_123',
        },
      };
    }),

    findByUsernameOrEmail: vi.fn(async () => user),
    findByUsername: vi.fn(async () => user),
    findByEmail: vi.fn(async () => user),
    findById: vi.fn(async () => user),
    touchUpdatedAt: vi.fn(async () => undefined),

    updateEmailVerification: vi.fn(async () => {
      return createTestUser({
        emailVerified: true,
        updatedAt: TEST_VERIFIED_AT,
      });
    }),
  };
};

const createMockAccountRepository = (): MockAccountRepository => {
  return {
    existsCredentialsAccount: vi.fn(async () => false),

    createCredentialsAndFlush: vi.fn(async (input: Record<string, unknown>) => {
      return {
        id: 'account_123',
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        providerAccountId: input.username,
        user: input.user,
      };
    }),

    findOneByUserIdAndProvider: vi.fn(async () => {
      return {
        id: 'account_123',
        provider: AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
        providerAccountId: TEST_USERNAME,
      };
    }),
  };
};

const createMockSessionService = (): MockSessionService => {
  return {
    createSession: vi.fn(async () => createSessionCreateResult()),

    refreshSession: vi.fn(async () => {
      return createSessionCreateResult();
    }),

    revokeCurrentSession: vi.fn(async () => {
      return {
        revoked: true,
        sessionId: TEST_SESSION_ID,
        revokedAt: TEST_CHANGED_AT.toISOString(),
      };
    }),

    revokeSession: vi.fn(async (sessionId: string) => {
      return {
        revoked: true,
        sessionId,
        revokedAt: TEST_CHANGED_AT.toISOString(),
      };
    }),

    revokeUserSessions: vi.fn(async () => 2),

    listUserSessions: vi.fn(async () => {
      return {
        sessions: [createSessionResponse()],
      };
    }),

    getSession: vi.fn(async () => createSessionResponse()),
  };
};

const createMockVerificationTokenService = (): MockVerificationTokenService => {
  return {
    createEmailVerificationToken: vi.fn(async () => {
      return createVerificationTokenCreateResult(
        TEST_EMAIL_VERIFICATION_TOKEN,
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );
    }),

    consumeEmailVerificationToken: vi.fn(async () => {
      return createVerificationTokenConsumeResult(
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );
    }),

    createPasswordResetToken: vi.fn(async () => {
      return createVerificationTokenCreateResult(
        TEST_PASSWORD_RESET_TOKEN,
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );
    }),

    consumePasswordResetToken: vi.fn(async () => {
      return createVerificationTokenConsumeResult(
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );
    }),

    revokeVerificationToken: vi.fn(async () => {
      return {
        revoked: true,
        revokedAt: TEST_CHANGED_AT.toISOString(),
      };
    }),
  };
};

const createMockPasswordService = (): MockPasswordService => {
  return {
    hashPassword: vi.fn(async () => TEST_PASSWORD_HASH),
    verifyPassword: vi.fn(async () => true),
    needsRehash: vi.fn(() => false),
    assertPasswordMatches: vi.fn(async () => undefined),
  };
};

const createTestAuthService = ({
  userRepository = createMockUserRepository(),
  accountRepository = createMockAccountRepository(),
  sessionService = createMockSessionService(),
  verificationTokenService = createMockVerificationTokenService(),
  passwordService = createMockPasswordService(),
}: {
  userRepository?: MockUserRepository;
  accountRepository?: MockAccountRepository;
  sessionService?: MockSessionService;
  verificationTokenService?: MockVerificationTokenService;
  passwordService?: MockPasswordService;
} = {}) => {
  const service = createAuthService({
    userRepository: userRepository as unknown as UserRepository,
    accountRepository: accountRepository as unknown as AccountRepository,
    sessionService: sessionService as unknown as SessionService,
    verificationTokenService:
      verificationTokenService as unknown as VerificationTokenService,
    passwordService: passwordService as unknown as PasswordService,
  });

  return {
    service,
    userRepository,
    accountRepository,
    sessionService,
    verificationTokenService,
    passwordService,
  };
};

describe('AuthService', () => {
  describe('register', () => {
    it('creates a user, credentials account, and session', async () => {
      const {
        service,
        userRepository,
        accountRepository,
        sessionService,
        passwordService,
      } = createTestAuthService();

      const result = await service.register(
        createRegisterInput(),
        TEST_METADATA,
      );

      expect(userRepository.assertUsernameAvailable).toHaveBeenCalledWith(
        TEST_USERNAME,
      );
      expect(userRepository.assertEmailAvailable).toHaveBeenCalledWith(
        TEST_EMAIL,
      );
      expect(accountRepository.existsCredentialsAccount).toHaveBeenCalledWith(
        TEST_USERNAME,
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith(TEST_PASSWORD);

      expect(userRepository.createUserWithDefaults).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          displayName: TEST_DISPLAY_NAME,
          timezone: 'America/Boise',
          locale: 'en-US',
          emailVerified: false,
          status: AUTH_USER_STATUS.PENDING_VERIFICATION,
        }),
      );

      const createdUser = (
        userRepository.createUserWithDefaults.mock.results[0]?.value instanceof
        Promise
          ? await userRepository.createUserWithDefaults.mock.results[0].value
          : undefined
      )?.user as Record<string, unknown> | undefined;

      expect(createdUser?.hashedPassword).toBe(TEST_PASSWORD_HASH);
      expect(createdUser?.passwordHash).toBe(TEST_PASSWORD_HASH);

      expect(accountRepository.createCredentialsAndFlush).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          displayName: TEST_DISPLAY_NAME,
        }),
      );

      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          deviceName: TEST_METADATA.deviceName,
          userAgent: TEST_METADATA.userAgent,
          ipAddress: TEST_METADATA.ipAddress,
        }),
      );

      expect(result).toMatchObject({
        user: {
          id: TEST_USER_ID,
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          status: AUTH_USER_STATUS.PENDING_VERIFICATION,
        },
        session: {
          id: TEST_SESSION_ID,
        },
        tokens: {
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
        },
      });
    });

    it('normalizes username and email before checking availability', async () => {
      const { service, userRepository } = createTestAuthService();

      await service.register(
        createRegisterInput({
          username: '  SinLess777  ',
          email: '  SinLess777@Example.COM  ',
        }),
      );

      expect(userRepository.assertUsernameAvailable).toHaveBeenCalledWith(
        TEST_USERNAME,
      );
      expect(userRepository.assertEmailAvailable).toHaveBeenCalledWith(
        TEST_EMAIL,
      );
    });

    it('throws when username is unavailable', async () => {
      const userRepository = createMockUserRepository();

      userRepository.assertUsernameAvailable.mockResolvedValueOnce(false);

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(service.register(createRegisterInput())).rejects.toThrow();
    });

    it('throws when email is unavailable', async () => {
      const userRepository = createMockUserRepository();

      userRepository.assertEmailAvailable.mockResolvedValueOnce(false);

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(service.register(createRegisterInput())).rejects.toThrow();
    });

    it('throws when a credentials account already exists', async () => {
      const accountRepository = createMockAccountRepository();

      accountRepository.existsCredentialsAccount.mockResolvedValueOnce(true);

      const { service } = createTestAuthService({
        accountRepository,
      });

      await expect(service.register(createRegisterInput())).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('authenticates credentials and creates a session', async () => {
      const {
        service,
        userRepository,
        accountRepository,
        sessionService,
        passwordService,
      } = createTestAuthService();

      const result = await service.login(createLoginInput(), TEST_METADATA);

      expect(userRepository.findByUsernameOrEmail).toHaveBeenCalledWith(
        TEST_USERNAME,
      );
      expect(accountRepository.findOneByUserIdAndProvider).toHaveBeenCalledWith(
        TEST_USER_ID,
        AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      );
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        TEST_PASSWORD,
        TEST_PASSWORD_HASH,
      );
      expect(sessionService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          deviceName: TEST_METADATA.deviceName,
          userAgent: TEST_METADATA.userAgent,
          ipAddress: TEST_METADATA.ipAddress,
        }),
      );

      expect(result).toMatchObject({
        user: {
          username: TEST_USERNAME,
          email: TEST_EMAIL,
          status: AUTH_USER_STATUS.ACTIVE,
        },
        session: {
          id: TEST_SESSION_ID,
        },
        tokens: {
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: TEST_REFRESH_TOKEN,
        },
      });
    });

    it('throws when the user cannot be found', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findByUsernameOrEmail.mockResolvedValueOnce(null);

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(service.login(createLoginInput())).rejects.toThrow();
    });

    it('throws when the user is disabled', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findByUsernameOrEmail.mockResolvedValueOnce(
        createTestUser({
          status: AUTH_USER_STATUS.DISABLED,
        }),
      );

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(service.login(createLoginInput())).rejects.toThrow();
    });

    it('throws when the credentials account cannot be found', async () => {
      const accountRepository = createMockAccountRepository();

      accountRepository.findOneByUserIdAndProvider.mockResolvedValueOnce(null);

      const { service } = createTestAuthService({
        accountRepository,
      });

      await expect(service.login(createLoginInput())).rejects.toThrow();
    });

    it('throws when the password does not match', async () => {
      const passwordService = createMockPasswordService();

      passwordService.verifyPassword.mockResolvedValueOnce(false);

      const { service } = createTestAuthService({
        passwordService,
      });

      await expect(service.login(createLoginInput())).rejects.toThrow();
    });

    it('rehashes the password when the stored hash is outdated', async () => {
      const passwordService = createMockPasswordService();

      passwordService.needsRehash.mockReturnValueOnce(true);
      passwordService.hashPassword.mockResolvedValueOnce(
        TEST_NEXT_PASSWORD_HASH,
      );

      const userRepository = createMockUserRepository();
      const user = createTestUser();

      userRepository.findByUsernameOrEmail.mockResolvedValueOnce(user);

      const { service } = createTestAuthService({
        userRepository,
        passwordService,
      });

      await service.login(createLoginInput());

      expect(passwordService.hashPassword).toHaveBeenCalledWith(TEST_PASSWORD);
      expect((user as unknown as Record<string, unknown>).hashedPassword).toBe(
        TEST_NEXT_PASSWORD_HASH,
      );
      expect(userRepository.touchUpdatedAt).toHaveBeenCalledWith(TEST_USER_ID);
    });
  });

  describe('refresh', () => {
    it('delegates refresh to SessionService', async () => {
      const { service, sessionService } = createTestAuthService();

      const result = await service.refresh(createRefreshInput(), TEST_METADATA);

      expect(sessionService.refreshSession).toHaveBeenCalledWith({
        refreshToken: TEST_REFRESH_TOKEN,
        sessionId: TEST_SESSION_ID,
        rotate: true,
        deviceName: TEST_METADATA.deviceName,
        userAgent: TEST_METADATA.userAgent,
        ipAddress: TEST_METADATA.ipAddress,
      });

      expect(result).toMatchObject({
        session: {
          id: TEST_SESSION_ID,
        },
        tokens: {
          refreshToken: TEST_REFRESH_TOKEN,
        },
      });
    });
  });

  describe('logout', () => {
    it('revokes the current session by refresh token/session id', async () => {
      const { service, sessionService } = createTestAuthService();

      const result = await service.logout(createLogoutInput());

      expect(sessionService.revokeCurrentSession).toHaveBeenCalledWith({
        refreshToken: TEST_REFRESH_TOKEN,
        sessionId: TEST_SESSION_ID,
      });
      expect(result).toMatchObject({
        revoked: true,
        sessionId: TEST_SESSION_ID,
      });
    });

    it('revokes all sessions for the session user when allSessions is true', async () => {
      const { service, sessionService } = createTestAuthService();

      const result = await service.logout(
        createLogoutInput({
          allSessions: true,
        }),
      );

      expect(sessionService.getSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(sessionService.revokeUserSessions).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
      });
      expect(result).toMatchObject({
        revoked: true,
        sessionId: TEST_SESSION_ID,
      });
    });

    it('throws when allSessions is true and sessionId is missing', async () => {
      const { service } = createTestAuthService();

      await expect(
        service.logout(
          createLogoutInput({
            allSessions: true,
            sessionId: undefined,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('username-scoped auth', () => {
    it('gets auth identity for the authenticated username', async () => {
      const { service, userRepository } = createTestAuthService();

      const result = await service.getAuthForUsername(
        TEST_USERNAME,
        TEST_USERNAME,
      );

      expect(userRepository.findByUsername).toHaveBeenCalledWith(TEST_USERNAME);
      expect(result).toMatchObject({
        user: {
          username: TEST_USERNAME,
          email: TEST_EMAIL,
        },
      });
    });

    it('allows admins to get auth identity for another username', async () => {
      const { service } = createTestAuthService();

      await expect(
        service.getAuthForUsername(TEST_USERNAME, 'other-user', true),
      ).resolves.toMatchObject({
        user: {
          username: TEST_USERNAME,
        },
      });
    });

    it('throws when a non-admin accesses another username', async () => {
      const { service } = createTestAuthService();

      await expect(
        service.getAuthForUsername(TEST_USERNAME, 'other-user', false),
      ).rejects.toThrow();
    });

    it('lists sessions for a username', async () => {
      const { service, sessionService } = createTestAuthService();

      const result = await service.listSessionsForUsername(
        TEST_USERNAME,
        TEST_USERNAME,
        {
          includeExpired: true,
          includeRevoked: true,
        },
      );

      expect(sessionService.listUserSessions).toHaveBeenCalledWith(
        TEST_USER_ID,
        {
          includeExpired: true,
          includeRevoked: true,
        },
      );
      expect(result.sessions).toHaveLength(1);
    });

    it('revokes a session for a username', async () => {
      const { service, sessionService } = createTestAuthService();

      const result = await service.revokeSessionForUsername(
        TEST_USERNAME,
        TEST_USERNAME,
        TEST_SESSION_ID,
      );

      expect(sessionService.getSession).toHaveBeenCalledWith(TEST_SESSION_ID);
      expect(sessionService.revokeSession).toHaveBeenCalledWith(
        TEST_SESSION_ID,
      );
      expect(result).toMatchObject({
        revoked: true,
        sessionId: TEST_SESSION_ID,
      });
    });

    it('throws when revoking a session that belongs to another user', async () => {
      const sessionService = createMockSessionService();

      sessionService.getSession.mockResolvedValueOnce(
        createSessionResponse({
          userId: 'other_user',
        }),
      );

      const { service } = createTestAuthService({
        sessionService,
      });

      await expect(
        service.revokeSessionForUsername(
          TEST_USERNAME,
          TEST_USERNAME,
          TEST_SESSION_ID,
        ),
      ).rejects.toThrow();
    });
  });

  describe('email verification', () => {
    it('creates an email verification token for a username', async () => {
      const { service, verificationTokenService } = createTestAuthService();

      const result = await service.createEmailVerificationToken(
        TEST_USERNAME,
        TEST_USERNAME,
        createEmailVerificationTokenInput(),
      );

      expect(
        verificationTokenService.createEmailVerificationToken,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          identifier: TEST_EMAIL,
        }),
      );

      expect(result.response).toMatchObject({
        created: true,
        token: TEST_EMAIL_VERIFICATION_TOKEN,
      });
    });

    it('throws when email is already verified', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findByUsername.mockResolvedValueOnce(
        createTestUser({
          emailVerified: true,
        }),
      );

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(
        service.createEmailVerificationToken(
          TEST_USERNAME,
          TEST_USERNAME,
          createEmailVerificationTokenInput(),
        ),
      ).rejects.toThrow();
    });

    it('verifies email when the token belongs to the user', async () => {
      const { service, userRepository, verificationTokenService } =
        createTestAuthService();

      const result = await service.verifyEmail(
        TEST_USERNAME,
        TEST_USERNAME,
        createVerifyEmailInput(),
      );

      expect(
        verificationTokenService.consumeEmailVerificationToken,
      ).toHaveBeenCalledWith({
        token: TEST_EMAIL_VERIFICATION_TOKEN,
      });

      expect(userRepository.updateEmailVerification).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        verified: true,
        verifiedAt: expect.any(Date),
      });

      expect(result).toMatchObject({
        verified: true,
        username: TEST_USERNAME,
        email: TEST_EMAIL,
      });
    });

    it('throws when the email verification token belongs to another user', async () => {
      const verificationTokenService = createMockVerificationTokenService();

      verificationTokenService.consumeEmailVerificationToken.mockResolvedValueOnce(
        createVerificationTokenConsumeResult(
          AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
          'other_user',
        ),
      );

      const { service } = createTestAuthService({
        verificationTokenService,
      });

      await expect(
        service.verifyEmail(
          TEST_USERNAME,
          TEST_USERNAME,
          createVerifyEmailInput(),
        ),
      ).rejects.toThrow();
    });
  });

  describe('password changes and reset', () => {
    it('changes a password and revokes user sessions', async () => {
      const userRepository = createMockUserRepository();
      const user = createTestUser();

      userRepository.findByUsername.mockResolvedValueOnce(user);

      const passwordService = createMockPasswordService();

      passwordService.hashPassword.mockResolvedValueOnce(
        TEST_NEXT_PASSWORD_HASH,
      );

      const { service, sessionService } = createTestAuthService({
        userRepository,
        passwordService,
      });

      const result = await service.changePassword(
        TEST_USERNAME,
        TEST_USERNAME,
        createPasswordChangeInput(),
      );

      expect(passwordService.assertPasswordMatches).toHaveBeenCalledWith(
        TEST_PASSWORD,
        TEST_PASSWORD_HASH,
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith(
        TEST_NEW_PASSWORD,
      );
      expect((user as unknown as Record<string, unknown>).hashedPassword).toBe(
        TEST_NEXT_PASSWORD_HASH,
      );
      expect(userRepository.touchUpdatedAt).toHaveBeenCalledWith(TEST_USER_ID);
      expect(sessionService.revokeUserSessions).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        revokedAt: expect.any(Date),
      });
      expect(result).toMatchObject({
        changed: true,
        changedAt: expect.any(String),
      });
    });

    it('throws when changing password without a current password hash', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findByUsername.mockResolvedValueOnce(
        createTestUser({
          hashedPassword: undefined,
          passwordHash: undefined,
        }),
      );

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(
        service.changePassword(
          TEST_USERNAME,
          TEST_USERNAME,
          createPasswordChangeInput(),
        ),
      ).rejects.toThrow();
    });

    it('creates a password reset token by username', async () => {
      const { service, userRepository, verificationTokenService } =
        createTestAuthService();

      const result = await service.createPasswordResetToken(
        createPasswordResetTokenInput(),
      );

      expect(userRepository.findByUsername).toHaveBeenCalledWith(TEST_USERNAME);
      expect(
        verificationTokenService.createPasswordResetToken,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          username: TEST_USERNAME,
          identifier: TEST_EMAIL,
        }),
      );
      expect(result.response).toMatchObject({
        created: true,
        token: TEST_PASSWORD_RESET_TOKEN,
      });
    });

    it('creates a password reset token by email', async () => {
      const { service, userRepository } = createTestAuthService();

      await service.createPasswordResetToken(
        createPasswordResetTokenInput({
          username: undefined,
          email: TEST_EMAIL,
        }),
      );

      expect(userRepository.findByEmail).toHaveBeenCalledWith(TEST_EMAIL);
    });

    it('throws when password reset token user cannot be found', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findByUsername.mockResolvedValueOnce(null);

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(
        service.createPasswordResetToken(createPasswordResetTokenInput()),
      ).rejects.toThrow();
    });

    it('resets password and revokes user sessions', async () => {
      const userRepository = createMockUserRepository();
      const user = createTestUser();

      userRepository.findById.mockResolvedValueOnce(user);

      const passwordService = createMockPasswordService();

      passwordService.hashPassword.mockResolvedValueOnce(
        TEST_NEXT_PASSWORD_HASH,
      );

      const { service, verificationTokenService, sessionService } =
        createTestAuthService({
          userRepository,
          passwordService,
        });

      const result = await service.resetPassword(createPasswordResetInput());

      expect(
        verificationTokenService.consumePasswordResetToken,
      ).toHaveBeenCalledWith({
        token: TEST_PASSWORD_RESET_TOKEN,
      });
      expect(userRepository.findById).toHaveBeenCalledWith(TEST_USER_ID);
      expect(passwordService.hashPassword).toHaveBeenCalledWith(
        TEST_NEW_PASSWORD,
      );
      expect((user as unknown as Record<string, unknown>).hashedPassword).toBe(
        TEST_NEXT_PASSWORD_HASH,
      );
      expect(userRepository.touchUpdatedAt).toHaveBeenCalledWith(TEST_USER_ID);
      expect(sessionService.revokeUserSessions).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        revokedAt: expect.any(Date),
      });
      expect(result).toMatchObject({
        reset: true,
        resetAt: expect.any(String),
      });
    });

    it('throws when reset password token user cannot be found', async () => {
      const userRepository = createMockUserRepository();

      userRepository.findById.mockResolvedValueOnce(null);

      const { service } = createTestAuthService({
        userRepository,
      });

      await expect(
        service.resetPassword(createPasswordResetInput()),
      ).rejects.toThrow();
    });
  });

  describe('revokeVerificationToken', () => {
    it('delegates verification token revocation', async () => {
      const { service, verificationTokenService } = createTestAuthService();

      const result = await service.revokeVerificationToken(
        TEST_EMAIL_VERIFICATION_TOKEN,
      );

      expect(
        verificationTokenService.revokeVerificationToken,
      ).toHaveBeenCalledWith({
        token: TEST_EMAIL_VERIFICATION_TOKEN,
      });

      expect(result).toMatchObject({
        revoked: true,
      });
    });
  });
});

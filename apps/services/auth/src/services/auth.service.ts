import { AuthError } from '@aerealith-ai/api';
import type { User } from '@aerealith-ai/db';
import type {
  AuthLoginSchemas,
  AuthPasswordSchemas,
  AuthRegisterSchemas,
  AuthSessionSchemas,
  AuthVerificationSchemas,
} from '@aerealith-ai/contracts';
import {
  AUTH_ACCOUNT_PROVIDER,
  AUTH_USER_STATUS,
  canAccessUsername,
  isAuthUserStatus,
  type AuthUserStatus,
  type PublicAuthUser,
} from '@aerealith-ai/contracts';

import type { AccountRepository } from '../repositories/account.repository';
import type { UserRepository } from '../repositories/user.repository';
import type { SessionService } from './session.service';
import {
  type AuthSessionResponse,
  type ListSessionsResult,
  type RevokeSessionResult,
} from './session.service';
import type { VerificationTokenService } from './verification-token.service';
import {
  type VerificationTokenConsumeResult,
  type VerificationTokenCreateResult,
  type VerificationTokenRevokeResult,
} from './verification-token.service';
import {
  passwordService as defaultPasswordService,
  type PasswordService,
} from './password.service';
import type {
  AuthAccessTokenClaims,
  AuthRefreshTokenClaims,
  AuthTokenPair,
} from '../types/auth-token.type';

export const AUTH_PERSISTENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthServiceOptions = {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  sessionService: SessionService;
  verificationTokenService: VerificationTokenService;
  passwordService?: PasswordService;
};

export type AuthRequestMetadata = {
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type AuthAccessContext = {
  authenticatedUsername: string;
  requestedUsername: string;
  isAdmin?: boolean;
};

export type AuthIdentityResponse = PublicAuthUser & {
  displayName?: string;
};

export type AuthPersistentSessionPolicy = {
  persistent: true;
  cookieMaxAgeSeconds: number;
  cookieExpiresAt: string;
  cookiePath: '/';
  cookieSameSite: 'lax';
};

export type AuthRegisterResult = {
  user: AuthIdentityResponse;
  emailVerificationToken: VerificationTokenCreateResult;
};

export type AuthLoginResult = {
  user: AuthIdentityResponse;
  session: AuthSessionResponse;
  tokens: AuthTokenPair;
  accessClaims: AuthAccessTokenClaims;
  refreshClaims: AuthRefreshTokenClaims;
  persistentSession: AuthPersistentSessionPolicy;
};

export type AuthRefreshResult = {
  session: AuthSessionResponse;
  tokens: AuthTokenPair;
  accessClaims: AuthAccessTokenClaims;
  refreshClaims: AuthRefreshTokenClaims;
  persistentSession: AuthPersistentSessionPolicy;
};

export type AuthLogoutResult = RevokeSessionResult;

export type AuthUsernameIdentityResult = {
  user: AuthIdentityResponse;
};

export type AuthPasswordChangeResult = {
  changed: boolean;
  changedAt: string;
};

export type AuthPasswordResetTokenResult = VerificationTokenCreateResult;

export type AuthPasswordResetResult = {
  reset: boolean;
  resetAt: string;
};

export type AuthEmailVerificationTokenResult = VerificationTokenCreateResult;

export type AuthEmailVerificationTokenForUserInput = {
  username?: string;
  email?: string;
};

export type AuthEmailVerificationTokenForUserResult = {
  user: AuthIdentityResponse;
  emailVerificationToken: VerificationTokenCreateResult;
};

export type AuthEmailVerificationResult = {
  verified: boolean;
  username: string;
  email: string;
  verifiedAt: string;
  token: VerificationTokenConsumeResult;
};

type RecordLike = Record<string, unknown>;

type MutableCredentialUser = User & {
  hashedPassword?: string;
  passwordHash?: string;
  updatedAt?: Date;
};

const DB_ONLY_USER_STATUS = {
  SUSPENDED: 'suspended',
} as const;

const readRecord = (value: unknown): RecordLike => {
  if (typeof value === 'object' && value !== null) {
    return value as RecordLike;
  }

  return {};
};

const readStringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'string') {
    return propertyValue;
  }

  return undefined;
};

const readBooleanProperty = (
  value: unknown,
  property: string,
): boolean | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'boolean') {
    return propertyValue;
  }

  return undefined;
};

const readDateProperty = (
  value: unknown,
  property: string,
): Date | undefined => {
  const propertyValue = readRecord(value)[property];

  if (propertyValue instanceof Date) {
    return propertyValue;
  }

  if (typeof propertyValue === 'string') {
    const date = new Date(propertyValue);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return undefined;
};

const normalizeUsername = (username: string): string => {
  return username.trim().toLowerCase();
};

const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

const createPersistentSessionPolicy = (): AuthPersistentSessionPolicy => {
  return {
    persistent: true,
    cookieMaxAgeSeconds: AUTH_PERSISTENT_SESSION_MAX_AGE_SECONDS,
    cookieExpiresAt: new Date(
      Date.now() + AUTH_PERSISTENT_SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString(),
    cookiePath: '/',
    cookieSameSite: 'lax',
  };
};

const getUserId = (user: User): string => {
  const id = readStringProperty(user, 'id');

  if (id === undefined) {
    throw AuthError.userNotFound();
  }

  return id;
};

const getUserUsername = (user: User): string => {
  const username = readStringProperty(user, 'username');

  if (username === undefined) {
    throw AuthError.userNotFound();
  }

  return username;
};

const getUserEmail = (user: User): string => {
  const email = readStringProperty(user, 'email');

  if (email === undefined) {
    throw AuthError.userNotFound();
  }

  return email;
};

const getUserDisplayName = (user: User): string | undefined => {
  return readStringProperty(user, 'displayName');
};

const getRawUserStatus = (user: User): string => {
  return readStringProperty(user, 'status') ?? AUTH_USER_STATUS.ACTIVE;
};

const getUserStatus = (user: User): AuthUserStatus => {
  const status = getRawUserStatus(user);

  if (isAuthUserStatus(status)) {
    return status;
  }

  if (status === DB_ONLY_USER_STATUS.SUSPENDED) {
    return AUTH_USER_STATUS.DISABLED;
  }

  return AUTH_USER_STATUS.ACTIVE;
};

const getUserCreatedAt = (user: User): Date => {
  return readDateProperty(user, 'createdAt') ?? new Date();
};

const getUserUpdatedAt = (user: User): Date => {
  return readDateProperty(user, 'updatedAt') ?? new Date();
};

const getEmailVerified = (user: User): boolean => {
  return readBooleanProperty(user, 'emailVerified') ?? false;
};

const getPasswordHash = (user: User): string | undefined => {
  return (
    readStringProperty(user, 'hashedPassword') ??
    readStringProperty(user, 'passwordHash')
  );
};

const setPasswordHash = (user: User, passwordHash: string): void => {
  const mutableUser = user as MutableCredentialUser;

  mutableUser.hashedPassword = passwordHash;
  mutableUser.passwordHash = passwordHash;
  mutableUser.updatedAt = new Date();
};

const toAuthIdentityResponse = (user: User): AuthIdentityResponse => {
  return {
    id: getUserId(user),
    username: getUserUsername(user),
    email: getUserEmail(user),
    emailVerified: getEmailVerified(user),
    status: getUserStatus(user),
    displayName: getUserDisplayName(user),
    createdAt: getUserCreatedAt(user).toISOString(),
    updatedAt: getUserUpdatedAt(user).toISOString(),
  };
};

const assertUserCanAuthenticate = (user: User): void => {
  const rawStatus = getRawUserStatus(user);
  const status = getUserStatus(user);

  if (
    status === AUTH_USER_STATUS.DISABLED ||
    rawStatus === DB_ONLY_USER_STATUS.SUSPENDED
  ) {
    throw AuthError.userDisabled();
  }

  if (status === AUTH_USER_STATUS.LOCKED) {
    throw AuthError.userLocked();
  }

  if (status === AUTH_USER_STATUS.DELETED) {
    throw AuthError.userDeleted();
  }

  if (!getEmailVerified(user)) {
    throw AuthError.forbidden('Please verify your email before logging in.');
  }
};

const assertCanAccessUsername = ({
  authenticatedUsername,
  requestedUsername,
  isAdmin = false,
}: AuthAccessContext): void => {
  const normalizedAuthenticatedUsername = normalizeUsername(
    authenticatedUsername,
  );
  const normalizedRequestedUsername = normalizeUsername(requestedUsername);

  if (
    !canAccessUsername({
      authenticatedUsername: normalizedAuthenticatedUsername,
      requestedUsername: normalizedRequestedUsername,
      isAdmin,
    })
  ) {
    throw AuthError.usernameAccessDenied(
      normalizedAuthenticatedUsername,
      normalizedRequestedUsername,
    );
  }
};

export class AuthService {
  private readonly userRepository: UserRepository;

  private readonly accountRepository: AccountRepository;

  private readonly sessionService: SessionService;

  private readonly verificationTokenService: VerificationTokenService;

  private readonly passwordService: PasswordService;

  public constructor(options: AuthServiceOptions) {
    this.userRepository = options.userRepository;
    this.accountRepository = options.accountRepository;
    this.sessionService = options.sessionService;
    this.verificationTokenService = options.verificationTokenService;
    this.passwordService = options.passwordService ?? defaultPasswordService;
  }

  private async findUserForEmailVerificationToken(
    input: AuthEmailVerificationTokenForUserInput,
  ): Promise<User> {
    const user =
      input.username !== undefined
        ? await this.userRepository.findByUsername(
            normalizeUsername(input.username),
          )
        : input.email !== undefined
          ? await this.userRepository.findByEmail(normalizeEmail(input.email))
          : null;

    if (user === null) {
      throw AuthError.userNotFound(input.username ?? input.email);
    }

    return user;
  }

  private async createEmailVerificationTokenForUserRecord(
    user: User,
    identifier?: string,
  ): Promise<VerificationTokenCreateResult> {
    if (getEmailVerified(user)) {
      throw AuthError.emailAlreadyVerified();
    }

    return this.verificationTokenService.createEmailVerificationToken({
      user,
      username: getUserUsername(user),
      identifier: identifier ?? getUserEmail(user),
    });
  }

  public async register(
    input: AuthRegisterSchemas.AuthRegisterDto,
    _metadata: AuthRequestMetadata = {},
  ): Promise<AuthRegisterResult> {
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);

    if (!(await this.userRepository.assertUsernameAvailable(username))) {
      throw AuthError.userAlreadyExists('username');
    }

    if (!(await this.userRepository.assertEmailAvailable(email))) {
      throw AuthError.userAlreadyExists('email');
    }

    if (await this.accountRepository.existsCredentialsAccount(username)) {
      throw AuthError.accountAlreadyExists(AUTH_ACCOUNT_PROVIDER.CREDENTIALS);
    }

    const passwordHash = await this.passwordService.hashPassword(
      input.password,
    );

    const { user } = await this.userRepository.createUserWithDefaults({
      username,
      email,
      displayName: input.displayName,
      timezone: input.timezone,
      locale: input.locale,
      emailVerified: false,
      status: AUTH_USER_STATUS.PENDING_VERIFICATION as User['status'],
    });

    setPasswordHash(user, passwordHash);

    await this.accountRepository.createCredentialsAndFlush({
      user,
      username,
      displayName: input.displayName ?? username,
    });

    const emailVerificationToken =
      await this.createEmailVerificationTokenForUserRecord(user, email);

    return {
      user: toAuthIdentityResponse(user),
      emailVerificationToken,
    };
  }

  public async login(
    input: AuthLoginSchemas.AuthLoginDto,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthLoginResult> {
    const user = await this.userRepository.findByUsernameOrEmail(
      input.identifier,
    );

    if (user === null) {
      throw AuthError.invalidCredentials();
    }

    assertUserCanAuthenticate(user);

    const passwordHash = getPasswordHash(user);

    if (passwordHash === undefined) {
      throw AuthError.invalidCredentials();
    }

    const credentialsAccount =
      await this.accountRepository.findOneByUserIdAndProvider(
        getUserId(user),
        AUTH_ACCOUNT_PROVIDER.CREDENTIALS,
      );

    if (credentialsAccount === null) {
      throw AuthError.invalidCredentials();
    }

    const matches = await this.passwordService.verifyPassword(
      input.password,
      passwordHash,
    );

    if (!matches) {
      throw AuthError.invalidCredentials();
    }

    if (this.passwordService.needsRehash(passwordHash)) {
      setPasswordHash(
        user,
        await this.passwordService.hashPassword(input.password),
      );
      await this.userRepository.touchUpdatedAt(getUserId(user));
    }

    const session = await this.sessionService.createSession({
      user,
      username: getUserUsername(user),
      deviceName: metadata.deviceName ?? input.deviceName,
      userAgent: metadata.userAgent ?? input.userAgent,
      ipAddress: metadata.ipAddress ?? input.ipAddress,
    });

    return {
      user: toAuthIdentityResponse(user),
      session: session.session,
      tokens: session.tokens,
      accessClaims: session.accessClaims,
      refreshClaims: session.refreshClaims,
      persistentSession: createPersistentSessionPolicy(),
    };
  }

  public async refresh(
    input: AuthSessionSchemas.AuthRefreshDto,
    metadata: AuthRequestMetadata = {},
  ): Promise<AuthRefreshResult> {
    const result = await this.sessionService.refreshSession({
      refreshToken: input.refreshToken,
      sessionId: input.sessionId,
      rotate: input.rotate,
      deviceName: metadata.deviceName ?? input.deviceName,
      userAgent: metadata.userAgent ?? input.userAgent,
      ipAddress: metadata.ipAddress ?? input.ipAddress,
    });

    return {
      session: result.session,
      tokens: result.tokens,
      accessClaims: result.accessClaims,
      refreshClaims: result.refreshClaims,
      persistentSession: createPersistentSessionPolicy(),
    };
  }

  public async logout(
    input: AuthSessionSchemas.AuthLogoutDto,
  ): Promise<AuthLogoutResult> {
    if (input.allSessions) {
      if (input.sessionId === undefined) {
        throw AuthError.sessionNotFound();
      }

      const session = await this.sessionService.getSession(input.sessionId);

      if (session.userId === undefined) {
        throw AuthError.sessionNotFound();
      }

      await this.sessionService.revokeUserSessions({
        userId: session.userId,
      });

      return {
        revoked: true,
        sessionId: input.sessionId,
        revokedAt: new Date().toISOString(),
      };
    }

    return this.sessionService.revokeCurrentSession({
      refreshToken: input.refreshToken,
      sessionId: input.sessionId,
    });
  }

  public async getAuthForUsername(
    authenticatedUsername: string,
    requestedUsername: string,
    isAdmin = false,
  ): Promise<AuthUsernameIdentityResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    return {
      user: toAuthIdentityResponse(user),
    };
  }

  public async listSessionsForUsername(
    authenticatedUsername: string,
    requestedUsername: string,
    options: AuthSessionSchemas.AuthListSessionsQuery = {
      includeExpired: false,
      includeRevoked: false,
    },
    isAdmin = false,
  ): Promise<ListSessionsResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    return this.sessionService.listUserSessions(getUserId(user), options);
  }

  public async revokeSessionForUsername(
    authenticatedUsername: string,
    requestedUsername: string,
    sessionId: string,
    isAdmin = false,
  ): Promise<RevokeSessionResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    const session = await this.sessionService.getSession(sessionId);

    if (session.userId !== undefined && session.userId !== getUserId(user)) {
      throw AuthError.forbidden('Session does not belong to this username.');
    }

    return this.sessionService.revokeSession(sessionId);
  }

  public async createEmailVerificationToken(
    authenticatedUsername: string,
    requestedUsername: string,
    input: AuthVerificationSchemas.AuthCreateEmailVerificationTokenDto = {},
    isAdmin = false,
  ): Promise<AuthEmailVerificationTokenResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    return this.createEmailVerificationTokenForUserRecord(
      user,
      input.email ?? getUserEmail(user),
    );
  }

  public async createEmailVerificationTokenForUser(
    input: AuthEmailVerificationTokenForUserInput,
  ): Promise<AuthEmailVerificationTokenForUserResult> {
    const user = await this.findUserForEmailVerificationToken(input);

    const emailVerificationToken =
      await this.createEmailVerificationTokenForUserRecord(
        user,
        input.email !== undefined ? normalizeEmail(input.email) : undefined,
      );

    return {
      user: toAuthIdentityResponse(user),
      emailVerificationToken,
    };
  }

  public async verifyEmail(
    authenticatedUsername: string,
    requestedUsername: string,
    input: AuthVerificationSchemas.AuthVerifyEmailDto,
    isAdmin = false,
  ): Promise<AuthEmailVerificationResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    const token =
      await this.verificationTokenService.consumeEmailVerificationToken({
        token: input.token,
      });

    if (token.claims.userId !== getUserId(user)) {
      throw AuthError.verificationTokenInvalid();
    }

    const verifiedAt = new Date();
    const updatedUser = await this.userRepository.updateEmailVerification({
      userId: getUserId(user),
      verified: true,
      verifiedAt,
    });

    if (updatedUser === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    return {
      verified: true,
      username: getUserUsername(updatedUser),
      email: getUserEmail(updatedUser),
      verifiedAt: verifiedAt.toISOString(),
      token,
    };
  }

  public async verifyEmailByToken(
    input: AuthVerificationSchemas.AuthVerifyEmailDto,
  ): Promise<AuthEmailVerificationResult> {
    const token =
      await this.verificationTokenService.consumeEmailVerificationToken({
        token: input.token,
      });

    const user = await this.userRepository.findById(token.claims.userId);

    if (user === null) {
      throw AuthError.userNotFound(token.claims.userId);
    }

    const verifiedAt = new Date();
    const updatedUser = await this.userRepository.updateEmailVerification({
      userId: getUserId(user),
      verified: true,
      verifiedAt,
    });

    if (updatedUser === null) {
      throw AuthError.userNotFound(token.claims.userId);
    }

    return {
      verified: true,
      username: getUserUsername(updatedUser),
      email: getUserEmail(updatedUser),
      verifiedAt: verifiedAt.toISOString(),
      token,
    };
  }

  public async changePassword(
    authenticatedUsername: string,
    requestedUsername: string,
    input: AuthPasswordSchemas.AuthPasswordChangeDto,
    isAdmin = false,
  ): Promise<AuthPasswordChangeResult> {
    assertCanAccessUsername({
      authenticatedUsername,
      requestedUsername,
      isAdmin,
    });

    const user = await this.userRepository.findByUsername(requestedUsername);

    if (user === null) {
      throw AuthError.userNotFound(requestedUsername);
    }

    const currentPasswordHash = getPasswordHash(user);

    if (currentPasswordHash === undefined) {
      throw AuthError.passwordInvalid();
    }

    await this.passwordService.assertPasswordMatches(
      input.currentPassword,
      currentPasswordHash,
    );

    const nextPasswordHash = await this.passwordService.hashPassword(
      input.newPassword,
    );

    setPasswordHash(user, nextPasswordHash);

    const changedAt = new Date();

    await this.userRepository.touchUpdatedAt(getUserId(user));

    await this.sessionService.revokeUserSessions({
      userId: getUserId(user),
      revokedAt: changedAt,
    });

    return {
      changed: true,
      changedAt: changedAt.toISOString(),
    };
  }

  public async createPasswordResetToken(
    input: AuthPasswordSchemas.AuthPasswordResetTokenDto,
  ): Promise<AuthPasswordResetTokenResult> {
    const user =
      input.username !== undefined
        ? await this.userRepository.findByUsername(input.username)
        : input.email !== undefined
          ? await this.userRepository.findByEmail(input.email)
          : null;

    if (user === null) {
      throw AuthError.userNotFound(input.username ?? input.email);
    }

    return this.verificationTokenService.createPasswordResetToken({
      user,
      username: getUserUsername(user),
      identifier: getUserEmail(user),
    });
  }

  public async resetPassword(
    input: AuthPasswordSchemas.AuthPasswordResetDto,
  ): Promise<AuthPasswordResetResult> {
    const token = await this.verificationTokenService.consumePasswordResetToken(
      {
        token: input.token,
      },
    );

    const user = await this.userRepository.findById(token.claims.userId);

    if (user === null) {
      throw AuthError.userNotFound(token.claims.userId);
    }

    const passwordHash = await this.passwordService.hashPassword(
      input.newPassword,
    );

    setPasswordHash(user, passwordHash);

    const resetAt = new Date();

    await this.userRepository.touchUpdatedAt(getUserId(user));

    await this.sessionService.revokeUserSessions({
      userId: getUserId(user),
      revokedAt: resetAt,
    });

    return {
      reset: true,
      resetAt: resetAt.toISOString(),
    };
  }

  public async revokeVerificationToken(
    token: string,
  ): Promise<VerificationTokenRevokeResult> {
    return this.verificationTokenService.revokeVerificationToken({
      token,
    });
  }
}

export const createAuthService = (options: AuthServiceOptions): AuthService => {
  return new AuthService(options);
};
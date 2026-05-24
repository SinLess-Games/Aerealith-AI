import { AuthError } from '@aerealith-ai/api';
import type { User, UserVerificationToken } from '@aerealith-ai/db';
import { AuthVerificationSchemas } from '@aerealith-ai/contracts';

import type { VerificationTokenRepository } from '../repositories/verification-token.repository';
import { type ListUserVerificationTokensOptions } from '../repositories/verification-token.repository';
import {
  tokenService as defaultTokenService,
  type TokenService,
} from './token.service';
import {
  AUTH_TOKEN_TYPE,
  type AuthTokenScope,
  type AuthTokenString,
  type AuthVerificationTokenClaims,
} from '../types/auth-token.type';

const { AUTH_VERIFICATION_TOKEN_TYPE } = AuthVerificationSchemas;

export type VerificationTokenServiceConfig = {
  emailVerificationTokenTtlSeconds: number;
  passwordResetTokenTtlSeconds: number;
  revokeExistingTokensOnCreate: boolean;
};

export type VerificationTokenServiceOptions = {
  repository: VerificationTokenRepository;
  tokenService?: TokenService;
  config?: Partial<VerificationTokenServiceConfig>;
};

export type CreateEmailVerificationTokenInput = {
  user: User;
  username?: string;
  identifier?: string | null;
  scopes?: AuthTokenScope[];
  expiresAt?: Date;
  revokeExisting?: boolean;
};

export type CreatePasswordResetTokenInput = {
  user: User;
  username?: string;
  identifier?: string | null;
  scopes?: AuthTokenScope[];
  expiresAt?: Date;
  revokeExisting?: boolean;
};

export type ConsumeVerificationTokenInput = {
  token: AuthTokenString;
};

export type RevokeVerificationTokenInput = {
  token: AuthTokenString;
  revokedAt?: Date;
};

export type RevokeUserVerificationTokensInput = {
  userId: string;
  type?: string;
  revokedAt?: Date;
};

export type VerificationTokenPublicResponse = {
  created: boolean;
  type: string;
  token: AuthTokenString;
  expiresAt: string;
};

export type VerificationTokenCreateResult = {
  response: VerificationTokenPublicResponse;
  token: AuthTokenString;
  tokenHash: string;
  claims: AuthVerificationTokenClaims;
  verificationToken: UserVerificationToken;
};

export type VerificationTokenConsumeResult = {
  consumed: boolean;
  type: string;
  consumedAt: string;
  claims: AuthVerificationTokenClaims;
  verificationToken: UserVerificationToken;
};

export type VerificationTokenRevokeResult = {
  revoked: boolean;
  revokedAt: string;
  verificationToken?: UserVerificationToken;
};

export type ListVerificationTokensResult = {
  verificationTokens: UserVerificationToken[];
};

type RuntimeGlobal = typeof globalThis & {
  crypto?: Crypto;
};

type RecordLike = Record<string, unknown>;

const DEFAULT_VERIFICATION_TOKEN_CONFIG: VerificationTokenServiceConfig = {
  emailVerificationTokenTtlSeconds: 86_400,
  passwordResetTokenTtlSeconds: 3_600,
  revokeExistingTokensOnCreate: true,
};

const TEXT_ENCODER = new TextEncoder();

const getCrypto = (): Crypto => {
  const runtime = globalThis as RuntimeGlobal;

  if (runtime.crypto === undefined) {
    throw new Error('Web Crypto API is not available in this runtime.');
  }

  return runtime.crypto;
};

const getSubtleCrypto = (): SubtleCrypto => {
  const crypto = getCrypto();

  if (crypto.subtle === undefined) {
    throw new Error('SubtleCrypto API is not available in this runtime.');
  }

  return crypto.subtle;
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  const base64 = btoa(binary);

  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const sha256Base64Url = async (value: string): Promise<string> => {
  const digest = await getSubtleCrypto().digest(
    'SHA-256',
    TEXT_ENCODER.encode(value),
  );

  return base64UrlEncode(new Uint8Array(digest));
};

const normalizeConfig = (
  config: Partial<VerificationTokenServiceConfig> = {},
): VerificationTokenServiceConfig => {
  const mergedConfig = {
    ...DEFAULT_VERIFICATION_TOKEN_CONFIG,
    ...config,
  };

  if (
    !Number.isInteger(mergedConfig.emailVerificationTokenTtlSeconds) ||
    mergedConfig.emailVerificationTokenTtlSeconds <= 0
  ) {
    throw new Error('Email verification token TTL must be a positive integer.');
  }

  if (
    !Number.isInteger(mergedConfig.passwordResetTokenTtlSeconds) ||
    mergedConfig.passwordResetTokenTtlSeconds <= 0
  ) {
    throw new Error('Password reset token TTL must be a positive integer.');
  }

  return mergedConfig;
};

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

const getUserId = (user: User): string => {
  const userId = readStringProperty(user, 'id');

  if (userId === undefined) {
    throw AuthError.userNotFound();
  }

  return userId;
};

const getUsername = (user: User, fallback?: string): string => {
  const username = fallback ?? readStringProperty(user, 'username');

  if (username === undefined) {
    throw AuthError.userNotFound();
  }

  return username;
};

const getUserEmail = (user: User, fallback?: string | null): string => {
  const email = fallback ?? readStringProperty(user, 'email');

  if (email === undefined || email === null) {
    throw AuthError.userNotFound();
  }

  return email;
};

const secondsToDate = (seconds: number): Date => {
  return new Date(seconds * 1000);
};

const secondsToIsoString = (seconds: number): string => {
  return secondsToDate(seconds).toISOString();
};

export class VerificationTokenService {
  private readonly repository: VerificationTokenRepository;

  private readonly tokenService: TokenService;

  private readonly config: VerificationTokenServiceConfig;

  public constructor(options: VerificationTokenServiceOptions) {
    this.repository = options.repository;
    this.tokenService = options.tokenService ?? defaultTokenService;
    this.config = normalizeConfig(options.config);
  }

  public async createEmailVerificationToken(
    input: CreateEmailVerificationTokenInput,
  ): Promise<VerificationTokenCreateResult> {
    const userId = getUserId(input.user);
    const username = getUsername(input.user, input.username);
    const identifier = getUserEmail(input.user, input.identifier);

    if (input.revokeExisting ?? this.config.revokeExistingTokensOnCreate) {
      await this.repository.revokeEmailVerificationTokens(userId);
    }

    const token = await this.tokenService.issueEmailVerificationToken({
      userId,
      username,
      scopes: input.scopes,
    });

    const claims = await this.tokenService.assertVerificationToken(
      token,
      AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
    );

    const tokenHash = await this.hashVerificationToken(token);
    const expiresAt = input.expiresAt ?? secondsToDate(claims.expiresAt);

    const verificationToken = await this.repository.createAndFlush({
      user: input.user,
      tokenHash,
      type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
      identifier,
      expiresAt,
    });

    return {
      response: {
        created: true,
        type: AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
        token,
        expiresAt: expiresAt.toISOString(),
      },
      token,
      tokenHash,
      claims,
      verificationToken,
    };
  }

  public async createPasswordResetToken(
    input: CreatePasswordResetTokenInput,
  ): Promise<VerificationTokenCreateResult> {
    const userId = getUserId(input.user);
    const username = getUsername(input.user, input.username);
    const identifier = getUserEmail(input.user, input.identifier);

    if (input.revokeExisting ?? this.config.revokeExistingTokensOnCreate) {
      await this.repository.revokePasswordResetTokens(userId);
    }

    const token = await this.tokenService.issuePasswordResetToken({
      userId,
      username,
      scopes: input.scopes,
    });

    const claims = await this.tokenService.assertVerificationToken(
      token,
      AUTH_TOKEN_TYPE.PASSWORD_RESET,
    );

    const tokenHash = await this.hashVerificationToken(token);
    const expiresAt = input.expiresAt ?? secondsToDate(claims.expiresAt);

    const verificationToken = await this.repository.createAndFlush({
      user: input.user,
      tokenHash,
      type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
      identifier,
      expiresAt,
    });

    return {
      response: {
        created: true,
        type: AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
        token,
        expiresAt: expiresAt.toISOString(),
      },
      token,
      tokenHash,
      claims,
      verificationToken,
    };
  }

  public async consumeEmailVerificationToken(
    input: ConsumeVerificationTokenInput,
  ): Promise<VerificationTokenConsumeResult> {
    return this.consumeTokenByType(
      input.token,
      AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
    );
  }

  public async consumePasswordResetToken(
    input: ConsumeVerificationTokenInput,
  ): Promise<VerificationTokenConsumeResult> {
    return this.consumeTokenByType(input.token, AUTH_TOKEN_TYPE.PASSWORD_RESET);
  }

  public async assertEmailVerificationToken(
    token: AuthTokenString,
  ): Promise<AuthVerificationTokenClaims> {
    const claims = await this.tokenService.assertVerificationToken(
      token,
      AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
    );

    const tokenHash = await this.hashVerificationToken(token);
    const verificationToken = await this.repository.findActiveByTokenHash(
      tokenHash,
      AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    );

    if (verificationToken === null) {
      throw AuthError.verificationTokenInvalid();
    }

    return claims;
  }

  public async assertPasswordResetToken(
    token: AuthTokenString,
  ): Promise<AuthVerificationTokenClaims> {
    const claims = await this.tokenService.assertVerificationToken(
      token,
      AUTH_TOKEN_TYPE.PASSWORD_RESET,
    );

    const tokenHash = await this.hashVerificationToken(token);
    const verificationToken = await this.repository.findActiveByTokenHash(
      tokenHash,
      AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
    );

    if (verificationToken === null) {
      throw AuthError.passwordResetTokenInvalid();
    }

    return claims;
  }

  public async revokeVerificationToken(
    input: RevokeVerificationTokenInput,
  ): Promise<VerificationTokenRevokeResult> {
    const revokedAt = input.revokedAt ?? new Date();
    const tokenHash = await this.hashVerificationToken(input.token);
    const verificationToken = await this.repository.revokeByTokenHash(
      tokenHash,
      revokedAt,
    );

    return {
      revoked: verificationToken !== null,
      revokedAt: revokedAt.toISOString(),
      ...(verificationToken === null ? {} : { verificationToken }),
    };
  }

  public async revokeUserVerificationTokens({
    userId,
    type,
    revokedAt = new Date(),
  }: RevokeUserVerificationTokensInput): Promise<number> {
    return this.repository.revokeUserVerificationTokens({
      userId,
      type,
      revokedAt,
    });
  }

  public async revokeEmailVerificationTokens(userId: string): Promise<number> {
    return this.repository.revokeEmailVerificationTokens(userId);
  }

  public async revokePasswordResetTokens(userId: string): Promise<number> {
    return this.repository.revokePasswordResetTokens(userId);
  }

  public async listUserVerificationTokens(
    userId: string,
    options: ListUserVerificationTokensOptions = {},
  ): Promise<ListVerificationTokensResult> {
    const verificationTokens = await this.repository.findByUserId(
      userId,
      options,
    );

    return {
      verificationTokens,
    };
  }

  public async findLatestEmailVerificationToken(
    userId: string,
  ): Promise<UserVerificationToken | null> {
    return this.repository.findLatestEmailVerificationToken(userId);
  }

  public async findLatestPasswordResetToken(
    userId: string,
  ): Promise<UserVerificationToken | null> {
    return this.repository.findLatestPasswordResetToken(userId);
  }

  public async deleteVerificationToken(tokenId: string): Promise<boolean> {
    return this.repository.deleteVerificationToken(tokenId);
  }

  public async hashVerificationToken(token: AuthTokenString): Promise<string> {
    return sha256Base64Url(token);
  }

  public getEmailVerificationTokenExpiresAt(): string {
    return secondsToIsoString(
      Math.floor(Date.now() / 1000) +
        this.config.emailVerificationTokenTtlSeconds,
    );
  }

  public getPasswordResetTokenExpiresAt(): string {
    return secondsToIsoString(
      Math.floor(Date.now() / 1000) + this.config.passwordResetTokenTtlSeconds,
    );
  }

  private async consumeTokenByType(
    token: AuthTokenString,
    expectedType:
      | typeof AUTH_TOKEN_TYPE.EMAIL_VERIFICATION
      | typeof AUTH_TOKEN_TYPE.PASSWORD_RESET,
  ): Promise<VerificationTokenConsumeResult> {
    const claims = await this.tokenService.assertVerificationToken(
      token,
      expectedType,
    );

    const tokenHash = await this.hashVerificationToken(token);
    const consumedAt = new Date();

    const verificationToken = await this.repository.consumeVerificationToken({
      tokenHash,
      type: expectedType,
      consumedAt,
    });

    if (verificationToken === null) {
      if (expectedType === AUTH_TOKEN_TYPE.PASSWORD_RESET) {
        throw AuthError.passwordResetTokenInvalid();
      }

      throw AuthError.verificationTokenInvalid();
    }

    return {
      consumed: true,
      type: expectedType,
      consumedAt: consumedAt.toISOString(),
      claims,
      verificationToken,
    };
  }
}

export const createVerificationTokenService = (
  options: VerificationTokenServiceOptions,
): VerificationTokenService => {
  return new VerificationTokenService(options);
};

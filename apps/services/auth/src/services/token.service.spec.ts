import { describe, expect, it } from 'vitest';

import { createTokenService, type TokenServiceConfig } from './token.service';
import {
  AUTH_TOKEN_ALGORITHM,
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  type AuthTokenString,
} from '../types/auth-token.type';

const TEST_TOKEN_CONFIG: TokenServiceConfig = {
  secret: 'test-auth-secret-that-is-long-enough-32-chars',
  issuer: 'helix-auth-test',
  audience: 'helix-api-test',
  algorithm: AUTH_TOKEN_ALGORITHM.HS256,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  emailVerificationTokenTtlSeconds: 86_400,
  passwordResetTokenTtlSeconds: 3_600,
};

const TEST_USER = {
  userId: 'user_123',
  username: 'sinless777',
  sessionId: 'session_123',
};

const createTestTokenService = (config: Partial<TokenServiceConfig> = {}) => {
  return createTokenService({
    config: {
      ...TEST_TOKEN_CONFIG,
      ...config,
    },
  });
};

const tamperJwtSignature = (token: AuthTokenString): AuthTokenString => {
  const [header, payload, signature] = token.split('.');

  if (
    header === undefined ||
    payload === undefined ||
    signature === undefined
  ) {
    throw new Error('Invalid test token shape.');
  }

  const replacement = signature.endsWith('a') ? 'b' : 'a';
  const tamperedSignature = `${signature.slice(0, -1)}${replacement}`;

  return `${header}.${payload}.${tamperedSignature}`;
};

describe('TokenService', () => {
  describe('constructor', () => {
    it('creates a token service with valid config', () => {
      const service = createTestTokenService();

      expect(service.getConfig()).toMatchObject({
        issuer: TEST_TOKEN_CONFIG.issuer,
        audience: TEST_TOKEN_CONFIG.audience,
        algorithm: TEST_TOKEN_CONFIG.algorithm,
      });
    });

    it('throws when the token secret is too short', () => {
      expect(() => {
        createTestTokenService({
          secret: 'too-short',
        });
      }).toThrow('Auth token secret must be at least 32 characters long.');
    });

    it('throws when access token TTL is not lower than refresh token TTL', () => {
      expect(() => {
        createTestTokenService({
          accessTokenTtlSeconds: 60,
          refreshTokenTtlSeconds: 60,
        });
      }).toThrow('Access token TTL must be lower than refresh token TTL.');
    });
  });

  describe('issueAccessToken', () => {
    it('issues and verifies an access token', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const claims = await service.assertAccessToken(token);

      expect(claims).toMatchObject({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        type: AUTH_TOKEN_TYPE.ACCESS,
        issuer: TEST_TOKEN_CONFIG.issuer,
        audience: TEST_TOKEN_CONFIG.audience,
      });

      expect(claims.id).toEqual(expect.any(String));
      expect(claims.issuedAt).toEqual(expect.any(Number));
      expect(claims.expiresAt).toBeGreaterThan(claims.issuedAt);
      expect(claims.scopes).toEqual(
        expect.arrayContaining([
          AUTH_TOKEN_SCOPE.AUTH_READ,
          AUTH_TOKEN_SCOPE.USER_READ,
          AUTH_TOKEN_SCOPE.SESSION_READ,
        ]),
      );
    });

    it('supports custom access token scopes', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        scopes: [AUTH_TOKEN_SCOPE.USER_READ],
      });

      const claims = await service.assertAccessToken(token);

      expect(claims.scopes).toEqual([AUTH_TOKEN_SCOPE.USER_READ]);
    });
  });

  describe('issueRefreshToken', () => {
    it('issues and verifies a refresh token', async () => {
      const service = createTestTokenService();

      const token = await service.issueRefreshToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const claims = await service.assertRefreshToken(token);

      expect(claims).toMatchObject({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        type: AUTH_TOKEN_TYPE.REFRESH,
      });

      expect(claims.scopes).toEqual(
        expect.arrayContaining([
          AUTH_TOKEN_SCOPE.AUTH_WRITE,
          AUTH_TOKEN_SCOPE.SESSION_WRITE,
        ]),
      );
    });

    it('rejects a refresh token when an access token is required', async () => {
      const service = createTestTokenService();

      const token = await service.issueRefreshToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      await expect(service.assertAccessToken(token)).rejects.toThrow();
    });
  });

  describe('verification tokens', () => {
    it('issues and verifies an email verification token', async () => {
      const service = createTestTokenService();

      const token = await service.issueEmailVerificationToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
      });

      const claims = await service.assertVerificationToken(
        token,
        AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      );

      expect(claims).toMatchObject({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      });
    });

    it('issues and verifies a password reset token', async () => {
      const service = createTestTokenService();

      const token = await service.issuePasswordResetToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
      });

      const claims = await service.assertVerificationToken(
        token,
        AUTH_TOKEN_TYPE.PASSWORD_RESET,
      );

      expect(claims).toMatchObject({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
      });
    });

    it('rejects a password reset token when email verification is expected', async () => {
      const service = createTestTokenService();

      const token = await service.issuePasswordResetToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
      });

      await expect(
        service.assertVerificationToken(
          token,
          AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
        ),
      ).rejects.toThrow();
    });
  });

  describe('issueTokenPair', () => {
    it('issues an access and refresh token pair', async () => {
      const service = createTestTokenService();

      const pair = await service.issueTokenPair({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      expect(pair).toMatchObject({
        tokenType: 'Bearer',
      });

      expect(pair.accessToken).toEqual(expect.any(String));
      expect(pair.refreshToken).toEqual(expect.any(String));
      expect(pair.accessTokenExpiresAt).toEqual(expect.any(String));
      expect(pair.refreshTokenExpiresAt).toEqual(expect.any(String));

      const accessClaims = await service.assertAccessToken(pair.accessToken);
      const refreshClaims = await service.assertRefreshToken(pair.refreshToken);

      expect(accessClaims.type).toBe(AUTH_TOKEN_TYPE.ACCESS);
      expect(refreshClaims.type).toBe(AUTH_TOKEN_TYPE.REFRESH);
      expect(accessClaims.sessionId).toBe(TEST_USER.sessionId);
      expect(refreshClaims.sessionId).toBe(TEST_USER.sessionId);
    });
  });

  describe('verifyToken', () => {
    it('returns valid true for a valid token', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const result = await service.verifyToken(token, {
        expectedType: AUTH_TOKEN_TYPE.ACCESS,
      });

      expect(result).toMatchObject({
        valid: true,
      });

      const claims = result.claims;

      if (claims === undefined) {
        throw new Error('Expected token claims to be defined.');
      }

      expect(claims.type).toBe(AUTH_TOKEN_TYPE.ACCESS);
      expect(claims.userId).toBe(TEST_USER.userId);
    });

    it('returns valid false for a tampered token', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const result = await service.verifyToken(tamperJwtSignature(token));

      expect(result.valid).toBe(false);

      if (!result.valid) {
        expect(result.reason).toEqual(expect.any(String));
      }
    });

    it('returns valid false when a required scope is missing', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        scopes: [AUTH_TOKEN_SCOPE.USER_READ],
      });

      const result = await service.verifyToken(token, {
        expectedType: AUTH_TOKEN_TYPE.ACCESS,
        requiredScopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
      });

      expect(result.valid).toBe(false);
    });
  });

  describe('assertValidToken', () => {
    it('accepts tokens with required scopes', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        scopes: [AUTH_TOKEN_SCOPE.USER_READ],
      });

      const claims = await service.assertValidToken(token, {
        expectedType: AUTH_TOKEN_TYPE.ACCESS,
        requiredScopes: [AUTH_TOKEN_SCOPE.USER_READ],
      });

      expect(claims.scopes).toEqual([AUTH_TOKEN_SCOPE.USER_READ]);
    });

    it('throws for tokens with missing required scopes', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        scopes: [AUTH_TOKEN_SCOPE.USER_READ],
      });

      await expect(
        service.assertValidToken(token, {
          expectedType: AUTH_TOKEN_TYPE.ACCESS,
          requiredScopes: [AUTH_TOKEN_SCOPE.AUTH_WRITE],
        }),
      ).rejects.toThrow();
    });

    it('throws when the token signature is tampered with', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      await expect(
        service.assertValidToken(tamperJwtSignature(token)),
      ).rejects.toThrow();
    });
  });

  describe('decodeToken', () => {
    it('decodes a token header and payload', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const decoded = service.decodeToken(token);

      expect(decoded.header).toMatchObject({
        alg: AUTH_TOKEN_ALGORITHM.HS256,
        typ: 'JWT',
      });

      expect(decoded.payload).toMatchObject({
        sub: TEST_USER.userId,
        username: TEST_USER.username,
        sid: TEST_USER.sessionId,
        typ: AUTH_TOKEN_TYPE.ACCESS,
        iss: TEST_TOKEN_CONFIG.issuer,
        aud: TEST_TOKEN_CONFIG.audience,
      });

      expect(decoded.signature).toEqual(expect.any(String));
      expect(decoded.signingInput).toContain('.');
    });

    it('decodes claims without verifying the signature', async () => {
      const service = createTestTokenService();

      const token = await service.issueAccessToken({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
      });

      const claims = service.decodeClaimsWithoutVerification(token);

      expect(claims).toMatchObject({
        userId: TEST_USER.userId,
        username: TEST_USER.username,
        sessionId: TEST_USER.sessionId,
        type: AUTH_TOKEN_TYPE.ACCESS,
      });
    });
  });
});

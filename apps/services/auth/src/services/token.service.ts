import { AuthError } from '@aerealith-ai/api';

import {
  AUTH_TOKEN_ALGORITHM,
  AUTH_TOKEN_SCOPE,
  AUTH_TOKEN_TYPE,
  authTokenClaimsToPayload,
  authTokenPayloadToClaims,
  isAuthTokenAlgorithm,
  isAuthTokenType,
  type AuthAccessTokenClaims,
  type AuthAccessTokenIssueInput,
  type AuthRefreshTokenClaims,
  type AuthRefreshTokenIssueInput,
  type AuthTokenClaims,
  type AuthTokenConfig,
  type AuthTokenIssueInput,
  type AuthTokenPair,
  type AuthTokenPayload,
  type AuthTokenScope,
  type AuthTokenString,
  type AuthTokenType,
  type AuthTokenVerifyResult,
  type AuthVerificationTokenClaims,
} from '../types/auth-token.type';

export type TokenServiceConfig = AuthTokenConfig & {
  secret: string;
};

export type TokenServiceOptions = {
  config?: Partial<TokenServiceConfig>;
};

export type VerifyTokenOptions = {
  expectedType?: AuthTokenType;
  requiredScopes?: AuthTokenScope[];
};

export type DecodedJwt = {
  header: JwtHeader;
  payload: AuthTokenPayload;
  signature: string;
  signingInput: string;
};

type RuntimeGlobal = typeof globalThis & {
  crypto?: Crypto;
};

type JwtHeader = {
  alg: string;
  typ: 'JWT';
};

const DEFAULT_TOKEN_CONFIG: TokenServiceConfig = {
  secret: 'dev-only-change-me-auth-secret-minimum-32-characters',
  issuer: 'helix-auth',
  audience: 'helix-api',
  algorithm: AUTH_TOKEN_ALGORITHM.HS256,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  emailVerificationTokenTtlSeconds: 86_400,
  passwordResetTokenTtlSeconds: 3_600,
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

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

const getHashName = (algorithm: string): string => {
  if (algorithm === AUTH_TOKEN_ALGORITHM.HS256) {
    return 'SHA-256';
  }

  if (algorithm === AUTH_TOKEN_ALGORITHM.HS384) {
    return 'SHA-384';
  }

  if (algorithm === AUTH_TOKEN_ALGORITHM.HS512) {
    return 'SHA-512';
  }

  throw AuthError.tokenInvalid(`Unsupported token algorithm: ${algorithm}`);
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  const base64 = btoa(binary);

  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const base64UrlDecode = (value: string): Uint8Array => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const base64UrlEncodeJson = (value: unknown): string => {
  return base64UrlEncode(TEXT_ENCODER.encode(JSON.stringify(value)));
};

const base64UrlDecodeJson = <T>(value: string): T => {
  const json = TEXT_DECODER.decode(base64UrlDecode(value));

  return JSON.parse(json) as T;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = TEXT_ENCODER.encode(left);
  const rightBytes = TEXT_ENCODER.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
};

const nowSeconds = (): number => {
  return Math.floor(Date.now() / 1000);
};

const secondsToIsoString = (seconds: number): string => {
  return new Date(seconds * 1000).toISOString();
};

const createTokenId = (): string => {
  const crypto = getCrypto();

  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
};

const normalizeConfig = (
  config: Partial<TokenServiceConfig> = {},
): TokenServiceConfig => {
  const mergedConfig = {
    ...DEFAULT_TOKEN_CONFIG,
    ...config,
  };

  if (mergedConfig.secret.length < 32) {
    throw new Error('Auth token secret must be at least 32 characters long.');
  }

  if (!isAuthTokenAlgorithm(mergedConfig.algorithm)) {
    throw new Error(`Invalid auth token algorithm: ${mergedConfig.algorithm}`);
  }

  if (
    mergedConfig.accessTokenTtlSeconds <= 0 ||
    mergedConfig.refreshTokenTtlSeconds <= 0 ||
    mergedConfig.emailVerificationTokenTtlSeconds <= 0 ||
    mergedConfig.passwordResetTokenTtlSeconds <= 0
  ) {
    throw new Error('Auth token TTL values must be positive integers.');
  }

  if (
    mergedConfig.accessTokenTtlSeconds >= mergedConfig.refreshTokenTtlSeconds
  ) {
    throw new Error('Access token TTL must be lower than refresh token TTL.');
  }

  return mergedConfig;
};

const getTokenTtlSeconds = (
  type: AuthTokenType,
  config: TokenServiceConfig,
): number => {
  if (type === AUTH_TOKEN_TYPE.ACCESS) {
    return config.accessTokenTtlSeconds;
  }

  if (type === AUTH_TOKEN_TYPE.REFRESH) {
    return config.refreshTokenTtlSeconds;
  }

  if (type === AUTH_TOKEN_TYPE.EMAIL_VERIFICATION) {
    return config.emailVerificationTokenTtlSeconds;
  }

  if (type === AUTH_TOKEN_TYPE.PASSWORD_RESET) {
    return config.passwordResetTokenTtlSeconds;
  }

  throw AuthError.tokenInvalid(`Unsupported token type: ${type}`);
};

const getDefaultScopes = (type: AuthTokenType): AuthTokenScope[] => {
  if (type === AUTH_TOKEN_TYPE.ACCESS) {
    return [
      AUTH_TOKEN_SCOPE.AUTH_READ,
      AUTH_TOKEN_SCOPE.USER_READ,
      AUTH_TOKEN_SCOPE.SESSION_READ,
    ];
  }

  if (type === AUTH_TOKEN_TYPE.REFRESH) {
    return [AUTH_TOKEN_SCOPE.AUTH_WRITE, AUTH_TOKEN_SCOPE.SESSION_WRITE];
  }

  return [AUTH_TOKEN_SCOPE.AUTH_WRITE];
};

const assertTokenPayloadShape = (payload: AuthTokenPayload): void => {
  if (
    typeof payload.jti !== 'string' ||
    typeof payload.sub !== 'string' ||
    typeof payload.username !== 'string' ||
    typeof payload.typ !== 'string' ||
    typeof payload.scope !== 'string' ||
    typeof payload.iss !== 'string' ||
    typeof payload.aud !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw AuthError.tokenInvalid();
  }

  if (!isAuthTokenType(payload.typ)) {
    throw AuthError.tokenInvalid();
  }
};

export class TokenService {
  private readonly config: TokenServiceConfig;

  public constructor(options: TokenServiceOptions = {}) {
    this.config = normalizeConfig(options.config);
  }

  public getConfig(): TokenServiceConfig {
    return this.config;
  }

  public async issueToken(
    input: AuthTokenIssueInput,
  ): Promise<AuthTokenString> {
    const issuedAt = nowSeconds();
    const expiresAt = issuedAt + getTokenTtlSeconds(input.type, this.config);

    const claims: AuthTokenClaims = {
      id: createTokenId(),
      userId: input.userId,
      username: input.username,
      sessionId: input.sessionId,
      type: input.type,
      scopes: input.scopes ?? getDefaultScopes(input.type),
      issuer: this.config.issuer,
      audience: this.config.audience,
      issuedAt,
      expiresAt,
    };

    return this.signClaims(claims);
  }

  public async issueAccessToken(
    input: AuthAccessTokenIssueInput,
  ): Promise<AuthTokenString> {
    return this.issueToken({
      ...input,
      type: AUTH_TOKEN_TYPE.ACCESS,
      scopes: input.scopes ?? getDefaultScopes(AUTH_TOKEN_TYPE.ACCESS),
    });
  }

  public async issueRefreshToken(
    input: AuthRefreshTokenIssueInput,
  ): Promise<AuthTokenString> {
    return this.issueToken({
      ...input,
      type: AUTH_TOKEN_TYPE.REFRESH,
      scopes: input.scopes ?? getDefaultScopes(AUTH_TOKEN_TYPE.REFRESH),
    });
  }

  public async issueEmailVerificationToken(
    input: Omit<AuthTokenIssueInput, 'type'>,
  ): Promise<AuthTokenString> {
    return this.issueToken({
      ...input,
      type: AUTH_TOKEN_TYPE.EMAIL_VERIFICATION,
      scopes:
        input.scopes ?? getDefaultScopes(AUTH_TOKEN_TYPE.EMAIL_VERIFICATION),
    });
  }

  public async issuePasswordResetToken(
    input: Omit<AuthTokenIssueInput, 'type'>,
  ): Promise<AuthTokenString> {
    return this.issueToken({
      ...input,
      type: AUTH_TOKEN_TYPE.PASSWORD_RESET,
      scopes: input.scopes ?? getDefaultScopes(AUTH_TOKEN_TYPE.PASSWORD_RESET),
    });
  }

  public async issueTokenPair(
    input: AuthAccessTokenIssueInput,
  ): Promise<AuthTokenPair> {
    const accessToken = await this.issueAccessToken(input);
    const refreshToken = await this.issueRefreshToken(input);

    const accessClaims = await this.assertAccessToken(accessToken);
    const refreshClaims = await this.assertRefreshToken(refreshToken);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: secondsToIsoString(accessClaims.expiresAt),
      refreshTokenExpiresAt: secondsToIsoString(refreshClaims.expiresAt),
      tokenType: 'Bearer',
    };
  }

  public async verifyToken(
    token: AuthTokenString,
    options: VerifyTokenOptions = {},
  ): Promise<AuthTokenVerifyResult> {
    try {
      const claims = await this.assertValidToken(token, options);

      return {
        valid: true,
        claims,
      };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public async assertValidToken(
    token: AuthTokenString,
    options: VerifyTokenOptions = {},
  ): Promise<AuthTokenClaims> {
    const decoded = this.decodeToken(token);
    const expectedSignature = await this.createSignature(decoded.signingInput);

    if (!constantTimeEqual(decoded.signature, expectedSignature)) {
      throw AuthError.tokenInvalid();
    }

    const claims = authTokenPayloadToClaims(decoded.payload);

    this.assertClaimsValid(claims, options);

    return claims;
  }

  public async assertAccessToken(
    token: AuthTokenString,
  ): Promise<AuthAccessTokenClaims> {
    const claims = await this.assertValidToken(token, {
      expectedType: AUTH_TOKEN_TYPE.ACCESS,
    });

    if (claims.sessionId === undefined) {
      throw AuthError.tokenInvalid('Access token is missing a session id.');
    }

    return {
      ...claims,
      type: AUTH_TOKEN_TYPE.ACCESS,
      sessionId: claims.sessionId,
    };
  }

  public async assertRefreshToken(
    token: AuthTokenString,
  ): Promise<AuthRefreshTokenClaims> {
    const claims = await this.assertValidToken(token, {
      expectedType: AUTH_TOKEN_TYPE.REFRESH,
    });

    if (claims.sessionId === undefined) {
      throw AuthError.tokenInvalid('Refresh token is missing a session id.');
    }

    return {
      ...claims,
      type: AUTH_TOKEN_TYPE.REFRESH,
      sessionId: claims.sessionId,
    };
  }

  public async assertVerificationToken(
    token: AuthTokenString,
    expectedType:
      | typeof AUTH_TOKEN_TYPE.EMAIL_VERIFICATION
      | typeof AUTH_TOKEN_TYPE.PASSWORD_RESET,
  ): Promise<AuthVerificationTokenClaims> {
    const claims = await this.assertValidToken(token, {
      expectedType,
    });

    return {
      ...claims,
      type: expectedType,
    };
  }

  public decodeToken(token: AuthTokenString): DecodedJwt {
    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (
      encodedHeader === undefined ||
      encodedPayload === undefined ||
      signature === undefined
    ) {
      throw AuthError.tokenInvalid();
    }

    const header = base64UrlDecodeJson<JwtHeader>(encodedHeader);
    const payload = base64UrlDecodeJson<AuthTokenPayload>(encodedPayload);

    if (header.typ !== 'JWT') {
      throw AuthError.tokenInvalid();
    }

    if (header.alg !== this.config.algorithm) {
      throw AuthError.tokenInvalid(`Unexpected token algorithm: ${header.alg}`);
    }

    assertTokenPayloadShape(payload);

    return {
      header,
      payload,
      signature,
      signingInput: `${encodedHeader}.${encodedPayload}`,
    };
  }

  public decodeClaimsWithoutVerification(
    token: AuthTokenString,
  ): AuthTokenClaims {
    return authTokenPayloadToClaims(this.decodeToken(token).payload);
  }

  private async signClaims(claims: AuthTokenClaims): Promise<AuthTokenString> {
    const header: JwtHeader = {
      alg: this.config.algorithm,
      typ: 'JWT',
    };

    const payload = authTokenClaimsToPayload(claims);
    const encodedHeader = base64UrlEncodeJson(header);
    const encodedPayload = base64UrlEncodeJson(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await this.createSignature(signingInput);

    return `${signingInput}.${signature}`;
  }

  private async createSignature(signingInput: string): Promise<string> {
    const key = await getSubtleCrypto().importKey(
      'raw',
      TEXT_ENCODER.encode(this.config.secret),
      {
        name: 'HMAC',
        hash: getHashName(this.config.algorithm),
      },
      false,
      ['sign'],
    );

    const signature = await getSubtleCrypto().sign(
      'HMAC',
      key,
      TEXT_ENCODER.encode(signingInput),
    );

    return base64UrlEncode(new Uint8Array(signature));
  }

  private assertClaimsValid(
    claims: AuthTokenClaims,
    options: VerifyTokenOptions,
  ): void {
    if (claims.issuer !== this.config.issuer) {
      throw AuthError.tokenInvalid('Token issuer is invalid.');
    }

    if (claims.audience !== this.config.audience) {
      throw AuthError.tokenInvalid('Token audience is invalid.');
    }

    if (claims.expiresAt <= nowSeconds()) {
      throw AuthError.tokenExpired();
    }

    if (
      options.expectedType !== undefined &&
      claims.type !== options.expectedType
    ) {
      throw AuthError.tokenTypeInvalid(options.expectedType, claims.type);
    }

    if (options.requiredScopes !== undefined) {
      const missingScopes = options.requiredScopes.filter((scope) => {
        return !claims.scopes.includes(scope);
      });

      if (missingScopes.length > 0) {
        throw AuthError.tokenScopeMissing(missingScopes);
      }
    }
  }
}

export const createTokenService = (
  options: TokenServiceOptions = {},
): TokenService => {
  return new TokenService(options);
};

export const tokenService = createTokenService();

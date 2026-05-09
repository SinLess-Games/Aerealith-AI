import { z } from 'zod';

import {
  environmentSchema,
  isoDateTimeSchema,
  requestIdSchema,
  uuidSchema,
} from './common.schema';

/**
 * Auth schemas shared across Helix services and clients.
 *
 * Keep this file framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export const authUserIdSchema = uuidSchema;
export const authIdentityIdSchema = uuidSchema;
export const authSessionIdSchema = uuidSchema;
export const authTokenIdSchema = uuidSchema;

export const authProviderSchema = z.enum([
  'password',
  'magic_link',
  'passkey',
  'google',
  'github',
  'discord',
  'microsoft',
  'saml',
  'oidc',
]);

export const authUserStatusSchema = z.enum([
  'active',
  'pending_verification',
  'disabled',
  'suspended',
  'deleted',
  'locked',
]);

export const authSessionStatusSchema = z.enum(['active', 'expired', 'revoked']);

export const authTokenTypeSchema = z.enum([
  'access',
  'refresh',
  'email_verification',
  'password_reset',
  'magic_link',
  'mfa_challenge',
]);

export const mfaMethodSchema = z.enum([
  'totp',
  'webauthn',
  'email',
  'sms',
  'recovery_code',
]);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const passwordSchema = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.')
  .regex(
    /[^a-zA-Z0-9]/,
    'Password must contain at least one special character.',
  );

export const loosePasswordSchema = z.string().min(1).max(256);

export const tokenSchema = z.string().trim().min(16).max(4096);

export const jwtSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

export const bearerTokenSchema = z
  .string()
  .trim()
  .regex(/^Bearer\s+[A-Za-z0-9._~+/-]+=*$/);

export const userAgentSchema = z.string().trim().min(1).max(1024);

export const ipAddressSchema = z.string().trim().min(3).max(128);

export const deviceIdSchema = z.string().trim().min(8).max(256);

export const turnstileTokenSchema = z.string().trim().min(1).max(4096);

export const authUserSchema = z.object({
  id: authUserIdSchema,
  email: emailSchema,
  status: authUserStatusSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
});

export const authIdentitySchema = z.object({
  id: authIdentityIdSchema,
  userId: authUserIdSchema,
  provider: authProviderSchema,
  providerAccountId: z.string().trim().min(1).max(512),
  email: emailSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const authSessionSchema = z.object({
  id: authSessionIdSchema,
  userId: authUserIdSchema,
  status: authSessionStatusSchema,
  ipAddress: ipAddressSchema.nullable(),
  userAgent: userAgentSchema.nullable(),
  deviceId: deviceIdSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
});

export const authTokenPairSchema = z.object({
  accessToken: jwtSchema,
  refreshToken: tokenSchema,
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  refreshExpiresIn: z.number().int().positive(),
});

export const authClaimsSchema = z.object({
  sub: authUserIdSchema,
  sid: authSessionIdSchema,
  typ: authTokenTypeSchema,
  roles: z.array(z.string().trim().min(1).max(64)).default(['user']),
  tenant: z.string().trim().min(1).max(128).optional(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  iss: z.string().trim().min(1).max(256).optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  turnstileToken: turnstileTokenSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const registerResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema.optional(),
  tokens: authTokenPairSchema.optional(),
  emailVerificationRequired: z.boolean(),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: loosePasswordSchema,
  turnstileToken: turnstileTokenSchema.optional(),
  deviceId: deviceIdSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const loginResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema,
  tokens: authTokenPairSchema,
  mfaRequired: z.boolean().default(false),
  mfaChallengeId: z.string().trim().min(1).max(256).optional(),
});

export const logoutRequestSchema = z.object({
  refreshToken: tokenSchema.optional(),
  sessionId: authSessionIdSchema.optional(),
  revokeAllSessions: z.boolean().optional(),
  requestId: requestIdSchema.optional(),
});

export const logoutResponseSchema = z.object({
  loggedOut: z.boolean(),
  revokedSessions: z.number().int().min(0),
});

export const refreshTokenRequestSchema = z.object({
  refreshToken: tokenSchema,
  requestId: requestIdSchema.optional(),
});

export const refreshTokenResponseSchema = z.object({
  session: authSessionSchema,
  tokens: authTokenPairSchema,
});

export const sessionRequestSchema = z.object({
  accessToken: jwtSchema.optional(),
  sessionId: authSessionIdSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: authUserSchema.nullable(),
  session: authSessionSchema.nullable(),
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: turnstileTokenSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const forgotPasswordResponseSchema = z.object({
  accepted: z.boolean(),
});

export const resetPasswordRequestSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
  requestId: requestIdSchema.optional(),
});

export const resetPasswordResponseSchema = z.object({
  passwordReset: z.boolean(),
});

export const verifyEmailRequestSchema = z.object({
  token: tokenSchema,
  requestId: requestIdSchema.optional(),
});

export const verifyEmailResponseSchema = z.object({
  emailVerified: z.boolean(),
  user: authUserSchema,
});

export const resendEmailVerificationRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: turnstileTokenSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const resendEmailVerificationResponseSchema = z.object({
  accepted: z.boolean(),
});

export const mfaChallengeRequestSchema = z.object({
  sessionId: authSessionIdSchema.optional(),
  email: emailSchema.optional(),
  method: mfaMethodSchema,
  requestId: requestIdSchema.optional(),
});

export const mfaChallengeResponseSchema = z.object({
  challengeId: z.string().trim().min(1).max(256),
  method: mfaMethodSchema,
  expiresAt: isoDateTimeSchema,
});

export const mfaVerifyRequestSchema = z.object({
  challengeId: z.string().trim().min(1).max(256),
  code: z.string().trim().min(4).max(128),
  requestId: requestIdSchema.optional(),
});

export const mfaVerifyResponseSchema = z.object({
  verified: z.boolean(),
  session: authSessionSchema.optional(),
  tokens: authTokenPairSchema.optional(),
});

export const jwkSchema = z.object({
  kty: z.string().trim().min(1),
  use: z.string().trim().min(1).optional(),
  kid: z.string().trim().min(1),
  alg: z.string().trim().min(1),
  n: z.string().trim().optional(),
  e: z.string().trim().optional(),
  crv: z.string().trim().optional(),
  x: z.string().trim().optional(),
  y: z.string().trim().optional(),
});

export const jwksResponseSchema = z.object({
  keys: z.array(jwkSchema),
});

export const authAuditEventSchema = z.object({
  id: uuidSchema,
  userId: authUserIdSchema.nullable(),
  sessionId: authSessionIdSchema.nullable(),
  eventType: z.string().trim().min(1).max(128),
  success: z.boolean(),
  ipAddress: ipAddressSchema.nullable(),
  userAgent: userAgentSchema.nullable(),
  environment: environmentSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: isoDateTimeSchema,
});

export type AuthUserId = z.infer<typeof authUserIdSchema>;
export type AuthIdentityId = z.infer<typeof authIdentityIdSchema>;
export type AuthSessionId = z.infer<typeof authSessionIdSchema>;
export type AuthTokenId = z.infer<typeof authTokenIdSchema>;

export type AuthProvider = z.infer<typeof authProviderSchema>;
export type AuthUserStatus = z.infer<typeof authUserStatusSchema>;
export type AuthSessionStatus = z.infer<typeof authSessionStatusSchema>;
export type AuthTokenType = z.infer<typeof authTokenTypeSchema>;
export type MfaMethod = z.infer<typeof mfaMethodSchema>;

export type AuthEmail = z.infer<typeof emailSchema>;
export type AuthPassword = z.infer<typeof passwordSchema>;
export type AuthToken = z.infer<typeof tokenSchema>;
export type AuthJwt = z.infer<typeof jwtSchema>;
export type AuthBearerToken = z.infer<typeof bearerTokenSchema>;

export type AuthUserInput = z.infer<typeof authUserSchema>;
export type AuthIdentityInput = z.infer<typeof authIdentitySchema>;
export type AuthSessionInput = z.infer<typeof authSessionSchema>;
export type AuthTokenPairInput = z.infer<typeof authTokenPairSchema>;
export type AuthClaimsInput = z.infer<typeof authClaimsSchema>;

export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;
export type RegisterResponseInput = z.infer<typeof registerResponseSchema>;

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type LoginResponseInput = z.infer<typeof loginResponseSchema>;

export type LogoutRequestInput = z.infer<typeof logoutRequestSchema>;
export type LogoutResponseInput = z.infer<typeof logoutResponseSchema>;

export type RefreshTokenRequestInput = z.infer<
  typeof refreshTokenRequestSchema
>;
export type RefreshTokenResponseInput = z.infer<
  typeof refreshTokenResponseSchema
>;

export type SessionRequestInput = z.infer<typeof sessionRequestSchema>;
export type SessionResponseInput = z.infer<typeof sessionResponseSchema>;

export type ForgotPasswordRequestInput = z.infer<
  typeof forgotPasswordRequestSchema
>;
export type ForgotPasswordResponseInput = z.infer<
  typeof forgotPasswordResponseSchema
>;

export type ResetPasswordRequestInput = z.infer<
  typeof resetPasswordRequestSchema
>;
export type ResetPasswordResponseInput = z.infer<
  typeof resetPasswordResponseSchema
>;

export type VerifyEmailRequestInput = z.infer<typeof verifyEmailRequestSchema>;
export type VerifyEmailResponseInput = z.infer<
  typeof verifyEmailResponseSchema
>;

export type ResendEmailVerificationRequestInput = z.infer<
  typeof resendEmailVerificationRequestSchema
>;
export type ResendEmailVerificationResponseInput = z.infer<
  typeof resendEmailVerificationResponseSchema
>;

export type MfaChallengeRequestInput = z.infer<
  typeof mfaChallengeRequestSchema
>;
export type MfaChallengeResponseInput = z.infer<
  typeof mfaChallengeResponseSchema
>;
export type MfaVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;
export type MfaVerifyResponseInput = z.infer<typeof mfaVerifyResponseSchema>;

export type JwkInput = z.infer<typeof jwkSchema>;
export type JwksResponseInput = z.infer<typeof jwksResponseSchema>;

export type AuthAuditEventInput = z.infer<typeof authAuditEventSchema>;

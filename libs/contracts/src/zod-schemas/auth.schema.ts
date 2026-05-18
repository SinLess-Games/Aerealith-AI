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

export const AUTH_SHARED_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  EMAIL_MAX_LENGTH: 320,
  PASSWORD_MIN_LENGTH: 8,
  STRONG_PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_LENGTH: 256,
  DISPLAY_NAME_MAX_LENGTH: 120,
  TIMEZONE_MAX_LENGTH: 64,
  LOCALE_MAX_LENGTH: 16,
  TOKEN_MIN_LENGTH: 16,
  TOKEN_MAX_LENGTH: 4096,
  DEVICE_ID_MIN_LENGTH: 8,
  DEVICE_ID_MAX_LENGTH: 256,
  USER_AGENT_MAX_LENGTH: 1024,
  IP_ADDRESS_MAX_LENGTH: 128,
  TENANT_MAX_LENGTH: 128,
  ROLE_MAX_LENGTH: 64,
  PROVIDER_ACCOUNT_ID_MAX_LENGTH: 512,
  REQUEST_TOKEN_MAX_LENGTH: 4096,
} as const;

export const AUTH_SHARED_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
  LOCALE: /^[a-z]{2,3}(?:-[A-Z]{2})?$/,
  JWT: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  BEARER_TOKEN: /^Bearer\s+[A-Za-z0-9._~+/-]+=*$/,
  UPPERCASE: /[A-Z]/,
  LOWERCASE: /[a-z]/,
  NUMBER: /\d/,
  SPECIAL_CHARACTER: /[^a-zA-Z0-9]/,
} as const;

export const authUserIdSchema = uuidSchema;
export const authIdentityIdSchema = uuidSchema;
export const authSessionIdSchema = uuidSchema;
export const authTokenIdSchema = uuidSchema;

export const authProviderSchema = z.enum([
  'credentials',
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

export const usernameSchema = z
  .string()
  .trim()
  .min(
    AUTH_SHARED_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${AUTH_SHARED_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SHARED_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${AUTH_SHARED_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_SHARED_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(
    AUTH_SHARED_LIMITS.EMAIL_MAX_LENGTH,
    `Email address must be at most ${AUTH_SHARED_LIMITS.EMAIL_MAX_LENGTH} characters.`,
  )
  .pipe(z.email('Email address must be valid.'));

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name cannot be empty.')
  .max(
    AUTH_SHARED_LIMITS.DISPLAY_NAME_MAX_LENGTH,
    `Display name must be at most ${AUTH_SHARED_LIMITS.DISPLAY_NAME_MAX_LENGTH} characters.`,
  );

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone cannot be empty.')
  .max(
    AUTH_SHARED_LIMITS.TIMEZONE_MAX_LENGTH,
    `Timezone must be at most ${AUTH_SHARED_LIMITS.TIMEZONE_MAX_LENGTH} characters.`,
  );

export const localeSchema = z
  .string()
  .trim()
  .regex(
    AUTH_SHARED_REGEX.LOCALE,
    'Locale must use a valid format such as en, en-US, or es-MX.',
  )
  .max(
    AUTH_SHARED_LIMITS.LOCALE_MAX_LENGTH,
    `Locale must be at most ${AUTH_SHARED_LIMITS.LOCALE_MAX_LENGTH} characters.`,
  );

export const passwordSchema = z
  .string()
  .min(
    AUTH_SHARED_LIMITS.STRONG_PASSWORD_MIN_LENGTH,
    `Password must be at least ${AUTH_SHARED_LIMITS.STRONG_PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_SHARED_REGEX.LOWERCASE,
    'Password must contain at least one lowercase letter.',
  )
  .regex(
    AUTH_SHARED_REGEX.UPPERCASE,
    'Password must contain at least one uppercase letter.',
  )
  .regex(
    AUTH_SHARED_REGEX.NUMBER,
    'Password must contain at least one number.',
  )
  .regex(
    AUTH_SHARED_REGEX.SPECIAL_CHARACTER,
    'Password must contain at least one special character.',
  );

export const registerPasswordSchema = z
  .string()
  .min(
    AUTH_SHARED_LIMITS.PASSWORD_MIN_LENGTH,
    `Password must be at least ${AUTH_SHARED_LIMITS.PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  );

export const loosePasswordSchema = z
  .string()
  .min(1, 'Password is required.')
  .max(
    AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_SHARED_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  );

export const tokenSchema = z
  .string()
  .trim()
  .min(
    AUTH_SHARED_LIMITS.TOKEN_MIN_LENGTH,
    `Token must be at least ${AUTH_SHARED_LIMITS.TOKEN_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SHARED_LIMITS.TOKEN_MAX_LENGTH,
    `Token must be at most ${AUTH_SHARED_LIMITS.TOKEN_MAX_LENGTH} characters.`,
  );

export const jwtSchema = z
  .string()
  .trim()
  .regex(AUTH_SHARED_REGEX.JWT, 'JWT must be valid.');

export const bearerTokenSchema = z
  .string()
  .trim()
  .regex(AUTH_SHARED_REGEX.BEARER_TOKEN, 'Bearer token must be valid.');

export const userAgentSchema = z
  .string()
  .trim()
  .min(1, 'User agent cannot be empty.')
  .max(
    AUTH_SHARED_LIMITS.USER_AGENT_MAX_LENGTH,
    `User agent must be at most ${AUTH_SHARED_LIMITS.USER_AGENT_MAX_LENGTH} characters.`,
  );

export const ipAddressSchema = z
  .string()
  .trim()
  .min(3, 'IP address cannot be empty.')
  .max(
    AUTH_SHARED_LIMITS.IP_ADDRESS_MAX_LENGTH,
    `IP address must be at most ${AUTH_SHARED_LIMITS.IP_ADDRESS_MAX_LENGTH} characters.`,
  );

export const deviceIdSchema = z
  .string()
  .trim()
  .min(
    AUTH_SHARED_LIMITS.DEVICE_ID_MIN_LENGTH,
    `Device id must be at least ${AUTH_SHARED_LIMITS.DEVICE_ID_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SHARED_LIMITS.DEVICE_ID_MAX_LENGTH,
    `Device id must be at most ${AUTH_SHARED_LIMITS.DEVICE_ID_MAX_LENGTH} characters.`,
  );

export const turnstileTokenSchema = z
  .string()
  .trim()
  .min(1, 'Turnstile token cannot be empty.')
  .max(
    AUTH_SHARED_LIMITS.REQUEST_TOKEN_MAX_LENGTH,
    `Turnstile token must be at most ${AUTH_SHARED_LIMITS.REQUEST_TOKEN_MAX_LENGTH} characters.`,
  );

export const authPublicUserSchema = z
  .object({
    id: z.string(),
    username: usernameSchema.or(z.string().min(1)),
    email: emailSchema.or(z.string().min(1)),
    emailVerified: z.boolean(),
    status: authUserStatusSchema.or(z.string().min(1)),
    displayName: z.string().optional(),
    createdAt: isoDateTimeSchema.or(z.string().min(1)),
    updatedAt: isoDateTimeSchema.or(z.string().min(1)),
  })
  .passthrough();

export const authUserSchema = z
  .object({
    id: authUserIdSchema.or(z.string().min(1)),
    username: usernameSchema.or(z.string().min(1)).optional(),
    email: emailSchema.or(z.string().min(1)),
    status: authUserStatusSchema,
    displayName: z.string().nullable().optional(),
    emailVerified: z.boolean().optional(),
    emailVerifiedAt: isoDateTimeSchema.nullable().optional(),
    lastLoginAt: isoDateTimeSchema.nullable().optional(),
    createdAt: isoDateTimeSchema.or(z.string().min(1)),
    updatedAt: isoDateTimeSchema.or(z.string().min(1)),
    deletedAt: isoDateTimeSchema.nullable().optional(),
  })
  .passthrough();

export const authIdentitySchema = z
  .object({
    id: authIdentityIdSchema.or(z.string().min(1)),
    userId: authUserIdSchema.or(z.string().min(1)),
    provider: authProviderSchema,
    providerAccountId: z
      .string()
      .trim()
      .min(1)
      .max(AUTH_SHARED_LIMITS.PROVIDER_ACCOUNT_ID_MAX_LENGTH),
    email: emailSchema.nullable(),
    createdAt: isoDateTimeSchema.or(z.string().min(1)),
    updatedAt: isoDateTimeSchema.or(z.string().min(1)),
  })
  .passthrough();

export const authSessionSchema = z
  .object({
    id: authSessionIdSchema.or(z.string().min(1)),
    userId: authUserIdSchema.or(z.string().min(1)).optional(),
    username: z.string().optional(),
    status: authSessionStatusSchema.optional(),
    ipAddress: ipAddressSchema.nullable().optional(),
    userAgent: userAgentSchema.nullable().optional(),
    deviceId: deviceIdSchema.nullable().optional(),
    deviceName: z.string().nullable().optional(),
    createdAt: isoDateTimeSchema.or(z.string().min(1)),
    updatedAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
    lastSeenAt: isoDateTimeSchema.or(z.string().min(1)).nullable().optional(),
    expiresAt: isoDateTimeSchema.or(z.string().min(1)),
    revokedAt: isoDateTimeSchema.or(z.string().min(1)).nullable().optional(),
  })
  .passthrough();

export const authTokenPairSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    tokenType: z.literal('Bearer').default('Bearer'),
    accessTokenExpiresAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
    refreshTokenExpiresAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
    expiresIn: z.number().int().positive().optional(),
    refreshExpiresIn: z.number().int().positive().optional(),
  })
  .passthrough();

export const authClaimsSchema = z
  .object({
    sub: z.string().min(1),
    sid: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    typ: authTokenTypeSchema.optional(),
    type: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    roles: z.array(z.string().trim().min(1).max(64)).default(['user']),
    tenant: z.string().trim().min(1).max(128).optional(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
    iss: z.string().trim().min(1).max(256).optional(),
    aud: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

export const authVerificationPublicResponseSchema = z
  .object({
    required: z.literal(true),
    emailSent: z.boolean(),
    message: z.string(),
  })
  .passthrough();

export const authVerificationTokenPublicResponseSchema = z
  .object({
    created: z.boolean(),
    type: authTokenTypeSchema.optional(),
    expiresAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
  })
  .passthrough();

export const registerRequestSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: registerPasswordSchema,
  displayName: displayNameSchema.optional(),
  timezone: timezoneSchema.default('America/Boise'),
  locale: localeSchema.default('en-US'),
  turnstileToken: turnstileTokenSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const registerResponseSchema = z.object({
  user: authPublicUserSchema,
  verification: authVerificationPublicResponseSchema,
});

export const registerServiceResponseSchema = z
  .object({
    user: authPublicUserSchema,
    emailVerificationToken: z
      .object({
        token: tokenSchema.optional(),
        rawToken: tokenSchema.optional(),
        plainToken: tokenSchema.optional(),
        verificationToken: tokenSchema.optional(),
        value: tokenSchema.optional(),
        expiresAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
        response: authVerificationTokenPublicResponseSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const registerLegacyResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema.optional(),
  tokens: authTokenPairSchema.optional(),
  emailVerificationRequired: z.boolean(),
});

export const loginRequestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Username or email must be at least 3 characters.')
    .max(
      AUTH_SHARED_LIMITS.EMAIL_MAX_LENGTH,
      `Username or email must be at most ${AUTH_SHARED_LIMITS.EMAIL_MAX_LENGTH} characters.`,
    )
    .transform((value) => value.toLowerCase()),
  password: loosePasswordSchema,
  remember: z.boolean().default(false),
  turnstileToken: turnstileTokenSchema.optional(),
  deviceId: deviceIdSchema.optional(),
  deviceName: z.string().trim().min(1).max(120).optional(),
  userAgent: userAgentSchema.optional(),
  ipAddress: ipAddressSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const loginLegacyRequestSchema = z.object({
  email: emailSchema,
  password: loosePasswordSchema,
  turnstileToken: turnstileTokenSchema.optional(),
  deviceId: deviceIdSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const loginResponseSchema = z.object({
  user: authPublicUserSchema,
  session: authSessionSchema,
  tokens: authTokenPairSchema,
  accessClaims: authClaimsSchema,
  refreshClaims: authClaimsSchema,
  mfaRequired: z.boolean().default(false).optional(),
  mfaChallengeId: z.string().trim().min(1).max(256).optional(),
});

export const loginLegacyResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema,
  tokens: authTokenPairSchema,
  mfaRequired: z.boolean().default(false),
  mfaChallengeId: z.string().trim().min(1).max(256).optional(),
});

export const logoutRequestSchema = z
  .object({
    refreshToken: tokenSchema.optional(),
    sessionId: z.string().trim().min(1).max(128).optional(),
    allSessions: z.boolean().default(false),
    revokeAllSessions: z.boolean().optional(),
    requestId: requestIdSchema.optional(),
  })
  .transform((value) => ({
    refreshToken: value.refreshToken,
    sessionId: value.sessionId,
    allSessions: value.allSessions || value.revokeAllSessions === true,
    requestId: value.requestId,
  }))
  .refine(
    (value) => {
      return (
        value.allSessions ||
        value.refreshToken !== undefined ||
        value.sessionId !== undefined
      );
    },
    {
      message:
        'Logout requires a refresh token, a session id, or allSessions set to true.',
      path: ['sessionId'],
    },
  );

export const logoutResponseSchema = z
  .object({
    revoked: z.boolean().optional(),
    loggedOut: z.boolean().optional(),
    sessionId: z.string().optional(),
    revokedAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
    revokedSessions: z.number().int().min(0).optional(),
  })
  .passthrough();

export const refreshTokenRequestSchema = z.object({
  refreshToken: tokenSchema,
  sessionId: z.string().trim().min(1).max(128).optional(),
  rotate: z.boolean().default(true),
  deviceName: z.string().trim().min(1).max(120).optional(),
  userAgent: userAgentSchema.optional(),
  ipAddress: ipAddressSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const refreshTokenResponseSchema = z.object({
  session: authSessionSchema,
  tokens: authTokenPairSchema,
  accessClaims: authClaimsSchema,
  refreshClaims: authClaimsSchema,
});

export const refreshTokenLegacyResponseSchema = z.object({
  session: authSessionSchema,
  tokens: authTokenPairSchema,
});

export const sessionRequestSchema = z.object({
  accessToken: z.string().min(1).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  requestId: requestIdSchema.optional(),
});

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: authPublicUserSchema.nullable(),
  session: authSessionSchema.nullable(),
});

export const forgotPasswordRequestSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  turnstileToken: turnstileTokenSchema.optional(),
  requestId: requestIdSchema.optional(),
}).refine(
  (value) => value.username !== undefined || value.email !== undefined,
  {
    message: 'Forgot password requires either username or email.',
    path: ['email'],
  },
);

export const forgotPasswordResponseSchema = z
  .object({
    accepted: z.boolean().optional(),
    created: z.boolean().optional(),
    expiresAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
  })
  .passthrough();

export const resetPasswordRequestSchema = z.object({
  token: tokenSchema,
  password: passwordSchema.optional(),
  newPassword: passwordSchema.optional(),
  confirmPassword: z.string().min(1).optional(),
  requestId: requestIdSchema.optional(),
}).refine(
  (value) => value.password !== undefined || value.newPassword !== undefined,
  {
    message: 'Reset password requires a password.',
    path: ['password'],
  },
).refine(
  (value) => {
    if (value.newPassword === undefined || value.confirmPassword === undefined) {
      return true;
    }

    return value.newPassword === value.confirmPassword;
  },
  {
    message: 'New password and confirmation password must match.',
    path: ['confirmPassword'],
  },
);

export const resetPasswordResponseSchema = z
  .object({
    passwordReset: z.boolean().optional(),
    reset: z.boolean().optional(),
    resetAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
  })
  .passthrough();

export const verifyEmailRequestSchema = z.object({
  token: tokenSchema,
  requestId: requestIdSchema.optional(),
});

export const verifyEmailResponseSchema = z
  .object({
    emailVerified: z.boolean().optional(),
    verified: z.boolean().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
    verifiedAt: isoDateTimeSchema.or(z.string().min(1)).optional(),
    user: authUserSchema.optional(),
    token: z.unknown().optional(),
  })
  .passthrough();

export const resendEmailVerificationRequestSchema = z
  .object({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    turnstileToken: turnstileTokenSchema.optional(),
    requestId: requestIdSchema.optional(),
  })
  .refine(
    (value) => value.username !== undefined || value.email !== undefined,
    {
      message: 'Resending email verification requires either username or email.',
      path: ['email'],
    },
  );

export const resendEmailVerificationResponseSchema = z.object({
  user: authPublicUserSchema,
  verification: authVerificationPublicResponseSchema,
});

export const resendEmailVerificationLegacyResponseSchema = z.object({
  accepted: z.boolean(),
});

export const mfaChallengeRequestSchema = z.object({
  sessionId: z.string().trim().min(1).max(128).optional(),
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

export const jwkSchema = z
  .object({
    kty: z.string().trim().min(1),
    use: z.string().trim().min(1).optional(),
    kid: z.string().trim().min(1),
    alg: z.string().trim().min(1),
    n: z.string().trim().optional(),
    e: z.string().trim().optional(),
    crv: z.string().trim().optional(),
    x: z.string().trim().optional(),
    y: z.string().trim().optional(),
  })
  .passthrough();

export const jwksResponseSchema = z.object({
  keys: z.array(jwkSchema),
});

export const authAuditEventSchema = z
  .object({
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
  })
  .passthrough();

export type AuthUserId = z.infer<typeof authUserIdSchema>;
export type AuthIdentityId = z.infer<typeof authIdentityIdSchema>;
export type AuthSessionId = z.infer<typeof authSessionIdSchema>;
export type AuthTokenId = z.infer<typeof authTokenIdSchema>;

export type AuthProvider = z.infer<typeof authProviderSchema>;
export type AuthUserStatus = z.infer<typeof authUserStatusSchema>;
export type AuthSessionStatus = z.infer<typeof authSessionStatusSchema>;
export type AuthTokenType = z.infer<typeof authTokenTypeSchema>;
export type MfaMethod = z.infer<typeof mfaMethodSchema>;

export type AuthUsername = z.infer<typeof usernameSchema>;
export type AuthEmail = z.infer<typeof emailSchema>;
export type AuthPassword = z.infer<typeof passwordSchema>;
export type AuthToken = z.infer<typeof tokenSchema>;
export type AuthJwt = z.infer<typeof jwtSchema>;
export type AuthBearerToken = z.infer<typeof bearerTokenSchema>;

export type AuthPublicUserInput = z.infer<typeof authPublicUserSchema>;
export type AuthUserInput = z.infer<typeof authUserSchema>;
export type AuthIdentityInput = z.infer<typeof authIdentitySchema>;
export type AuthSessionInput = z.infer<typeof authSessionSchema>;
export type AuthTokenPairInput = z.infer<typeof authTokenPairSchema>;
export type AuthClaimsInput = z.infer<typeof authClaimsSchema>;

export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;
export type RegisterResponseInput = z.infer<typeof registerResponseSchema>;
export type RegisterServiceResponseInput = z.infer<
  typeof registerServiceResponseSchema
>;
export type RegisterLegacyResponseInput = z.infer<
  typeof registerLegacyResponseSchema
>;

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type LoginLegacyRequestInput = z.infer<typeof loginLegacyRequestSchema>;
export type LoginResponseInput = z.infer<typeof loginResponseSchema>;
export type LoginLegacyResponseInput = z.infer<
  typeof loginLegacyResponseSchema
>;

export type LogoutRequestInput = z.input<typeof logoutRequestSchema>;
export type LogoutRequestDto = z.infer<typeof logoutRequestSchema>;
export type LogoutResponseInput = z.infer<typeof logoutResponseSchema>;

export type RefreshTokenRequestInput = z.infer<
  typeof refreshTokenRequestSchema
>;
export type RefreshTokenResponseInput = z.infer<
  typeof refreshTokenResponseSchema
>;
export type RefreshTokenLegacyResponseInput = z.infer<
  typeof refreshTokenLegacyResponseSchema
>;

export type SessionRequestInput = z.infer<typeof sessionRequestSchema>;
export type SessionResponseInput = z.infer<typeof sessionResponseSchema>;

export type ForgotPasswordRequestInput = z.infer<
  typeof forgotPasswordRequestSchema
>;
export type ForgotPasswordResponseInput = z.infer<
  typeof forgotPasswordResponseSchema
>;

export type ResetPasswordRequestInput = z.input<
  typeof resetPasswordRequestSchema
>;
export type ResetPasswordRequestDto = z.infer<
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
export type ResendEmailVerificationLegacyResponseInput = z.infer<
  typeof resendEmailVerificationLegacyResponseSchema
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
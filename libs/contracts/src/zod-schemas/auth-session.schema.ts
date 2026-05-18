import { z } from 'zod';

export const AUTH_SESSION_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  SESSION_ID_MIN_LENGTH: 8,
  SESSION_ID_MAX_LENGTH: 128,
  TOKEN_MIN_LENGTH: 16,
  TOKEN_MAX_LENGTH: 4096,
  DEVICE_NAME_MAX_LENGTH: 120,
  USER_AGENT_MAX_LENGTH: 512,
  IP_ADDRESS_MAX_LENGTH: 64,
} as const;

export const AUTH_SESSION_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
} as const;

export const authSessionUsernameSchema = z
  .string()
  .trim()
  .min(
    AUTH_SESSION_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${AUTH_SESSION_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SESSION_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${AUTH_SESSION_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_SESSION_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const authSessionIdSchema = z
  .string()
  .trim()
  .min(
    AUTH_SESSION_LIMITS.SESSION_ID_MIN_LENGTH,
    `Session id must be at least ${AUTH_SESSION_LIMITS.SESSION_ID_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SESSION_LIMITS.SESSION_ID_MAX_LENGTH,
    `Session id must be at most ${AUTH_SESSION_LIMITS.SESSION_ID_MAX_LENGTH} characters.`,
  );

export const authSessionTokenSchema = z
  .string()
  .trim()
  .min(
    AUTH_SESSION_LIMITS.TOKEN_MIN_LENGTH,
    `Token must be at least ${AUTH_SESSION_LIMITS.TOKEN_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_SESSION_LIMITS.TOKEN_MAX_LENGTH,
    `Token must be at most ${AUTH_SESSION_LIMITS.TOKEN_MAX_LENGTH} characters.`,
  );

export const authSessionDeviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Device name cannot be empty.')
  .max(
    AUTH_SESSION_LIMITS.DEVICE_NAME_MAX_LENGTH,
    `Device name must be at most ${AUTH_SESSION_LIMITS.DEVICE_NAME_MAX_LENGTH} characters.`,
  )
  .optional();

export const authSessionUserAgentSchema = z
  .string()
  .trim()
  .min(1, 'User agent cannot be empty.')
  .max(
    AUTH_SESSION_LIMITS.USER_AGENT_MAX_LENGTH,
    `User agent must be at most ${AUTH_SESSION_LIMITS.USER_AGENT_MAX_LENGTH} characters.`,
  )
  .optional();

export const authSessionIpAddressSchema = z
  .string()
  .trim()
  .min(1, 'IP address cannot be empty.')
  .max(
    AUTH_SESSION_LIMITS.IP_ADDRESS_MAX_LENGTH,
    `IP address must be at most ${AUTH_SESSION_LIMITS.IP_ADDRESS_MAX_LENGTH} characters.`,
  )
  .optional();

export const authUsernameParamsSchema = z.object({
  username: authSessionUsernameSchema,
});

export const authSessionParamsSchema = z.object({
  username: authSessionUsernameSchema,
  sessionId: authSessionIdSchema,
});

export const authRefreshSchema = z.object({
  refreshToken: authSessionTokenSchema,
  sessionId: authSessionIdSchema.optional(),
  rotate: z.boolean().default(true),
  deviceName: authSessionDeviceNameSchema,
  userAgent: authSessionUserAgentSchema,
  ipAddress: authSessionIpAddressSchema,
});

export const authRefreshRequestSchema = z.object({
  body: authRefreshSchema,
});

export const authLogoutSchema = z
  .object({
    refreshToken: authSessionTokenSchema.optional(),
    sessionId: authSessionIdSchema.optional(),
    allSessions: z.boolean().default(false),
  })
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

export const authLogoutRequestSchema = z.object({
  body: authLogoutSchema,
});

export const authListSessionsQuerySchema = z.object({
  includeRevoked: z.coerce.boolean().default(false),
  includeExpired: z.coerce.boolean().default(false),
});

export const authListSessionsRequestSchema = z.object({
  params: authUsernameParamsSchema,
  query: authListSessionsQuerySchema,
});

export const authDeleteSessionRequestSchema = z.object({
  params: authSessionParamsSchema,
});

export const authSessionResponseSchema = z
  .object({
    id: z.string(),
    userId: z.string().optional(),
    username: z.string().optional(),
    deviceName: z.string().nullable().optional(),
    userAgent: z.string().nullable().optional(),
    ipAddress: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
    lastSeenAt: z.string().nullable().optional(),
    expiresAt: z.string(),
    revokedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const authTokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer').default('Bearer'),
    accessTokenExpiresAt: z.string().optional(),
    refreshTokenExpiresAt: z.string().optional(),
  })
  .passthrough();

export const authAccessTokenClaimsSchema = z
  .object({
    sub: z.string().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
    sessionId: z.string().optional(),
    type: z.string().optional(),
    iat: z.number().optional(),
    exp: z.number().optional(),
  })
  .passthrough();

export const authRefreshTokenClaimsSchema = z
  .object({
    sub: z.string().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
    sessionId: z.string().optional(),
    type: z.string().optional(),
    iat: z.number().optional(),
    exp: z.number().optional(),
  })
  .passthrough();

export const authRefreshResponseSchema = z.object({
  session: authSessionResponseSchema,
  tokens: authTokenPairSchema,
  accessClaims: authAccessTokenClaimsSchema,
  refreshClaims: authRefreshTokenClaimsSchema,
});

export const authRefreshLegacyResponseSchema = z.object({
  session: authSessionResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  tokenType: z.literal('Bearer'),
});

export const authLogoutResponseSchema = z
  .object({
    revoked: z.boolean(),
    sessionId: z.string().optional(),
    revokedAt: z.string(),
  })
  .passthrough();

export const authListSessionsResponseSchema = z
  .object({
    sessions: z.array(authSessionResponseSchema),
  })
  .passthrough();

export const authDeleteSessionResponseSchema = z
  .object({
    revoked: z.boolean(),
    sessionId: z.string(),
    revokedAt: z.string(),
  })
  .passthrough();

export type AuthUsernameParams = z.infer<typeof authUsernameParamsSchema>;
export type AuthSessionParams = z.infer<typeof authSessionParamsSchema>;

export type AuthRefreshInput = z.input<typeof authRefreshSchema>;
export type AuthRefreshDto = z.infer<typeof authRefreshSchema>;
export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>;
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;
export type AuthRefreshLegacyResponse = z.infer<
  typeof authRefreshLegacyResponseSchema
>;

export type AuthLogoutInput = z.input<typeof authLogoutSchema>;
export type AuthLogoutDto = z.infer<typeof authLogoutSchema>;
export type AuthLogoutRequest = z.infer<typeof authLogoutRequestSchema>;
export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>;

export type AuthListSessionsQueryInput = z.input<
  typeof authListSessionsQuerySchema
>;
export type AuthListSessionsQuery = z.infer<typeof authListSessionsQuerySchema>;
export type AuthListSessionsRequest = z.infer<
  typeof authListSessionsRequestSchema
>;
export type AuthListSessionsResponse = z.infer<
  typeof authListSessionsResponseSchema
>;

export type AuthDeleteSessionRequest = z.infer<
  typeof authDeleteSessionRequestSchema
>;
export type AuthDeleteSessionResponse = z.infer<
  typeof authDeleteSessionResponseSchema
>;

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
export type AuthAccessTokenClaims = z.infer<typeof authAccessTokenClaimsSchema>;
export type AuthRefreshTokenClaims = z.infer<typeof authRefreshTokenClaimsSchema>;

export const parseAuthRefreshInput = (input: unknown): AuthRefreshDto => {
  return authRefreshSchema.parse(input);
};

export const safeParseAuthRefreshInput = (input: unknown) => {
  return authRefreshSchema.safeParse(input);
};

export const parseAuthRefreshResponse = (
  input: unknown,
): AuthRefreshResponse => {
  return authRefreshResponseSchema.parse(input);
};

export const safeParseAuthRefreshResponse = (input: unknown) => {
  return authRefreshResponseSchema.safeParse(input);
};

export const parseAuthLogoutInput = (input: unknown): AuthLogoutDto => {
  return authLogoutSchema.parse(input);
};

export const safeParseAuthLogoutInput = (input: unknown) => {
  return authLogoutSchema.safeParse(input);
};

export const parseAuthLogoutResponse = (
  input: unknown,
): AuthLogoutResponse => {
  return authLogoutResponseSchema.parse(input);
};

export const safeParseAuthLogoutResponse = (input: unknown) => {
  return authLogoutResponseSchema.safeParse(input);
};

export const parseAuthUsernameParams = (input: unknown): AuthUsernameParams => {
  return authUsernameParamsSchema.parse(input);
};

export const safeParseAuthUsernameParams = (input: unknown) => {
  return authUsernameParamsSchema.safeParse(input);
};

export const parseAuthSessionParams = (input: unknown): AuthSessionParams => {
  return authSessionParamsSchema.parse(input);
};

export const safeParseAuthSessionParams = (input: unknown) => {
  return authSessionParamsSchema.safeParse(input);
};

export const parseAuthSessionResponse = (
  input: unknown,
): AuthSessionResponse => {
  return authSessionResponseSchema.parse(input);
};

export const safeParseAuthSessionResponse = (input: unknown) => {
  return authSessionResponseSchema.safeParse(input);
};

export const parseAuthListSessionsResponse = (
  input: unknown,
): AuthListSessionsResponse => {
  return authListSessionsResponseSchema.parse(input);
};

export const safeParseAuthListSessionsResponse = (input: unknown) => {
  return authListSessionsResponseSchema.safeParse(input);
};

export const parseAuthDeleteSessionResponse = (
  input: unknown,
): AuthDeleteSessionResponse => {
  return authDeleteSessionResponseSchema.parse(input);
};

export const safeParseAuthDeleteSessionResponse = (input: unknown) => {
  return authDeleteSessionResponseSchema.safeParse(input);
};
import { z } from 'zod';

export const AUTH_LOGIN_LIMITS = {
  IDENTIFIER_MIN_LENGTH: 3,
  IDENTIFIER_MAX_LENGTH: 320,
  PASSWORD_MIN_LENGTH: 1,
  PASSWORD_MAX_LENGTH: 128,
  DEVICE_NAME_MAX_LENGTH: 120,
  USER_AGENT_MAX_LENGTH: 512,
  IP_ADDRESS_MAX_LENGTH: 64,
} as const;

export const authLoginIdentifierSchema = z
  .string()
  .trim()
  .min(
    AUTH_LOGIN_LIMITS.IDENTIFIER_MIN_LENGTH,
    `Username or email must be at least ${AUTH_LOGIN_LIMITS.IDENTIFIER_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_LOGIN_LIMITS.IDENTIFIER_MAX_LENGTH,
    `Username or email must be at most ${AUTH_LOGIN_LIMITS.IDENTIFIER_MAX_LENGTH} characters.`,
  )
  .transform((value) => value.toLowerCase());

export const authLoginPasswordSchema = z
  .string()
  .min(
    AUTH_LOGIN_LIMITS.PASSWORD_MIN_LENGTH,
    'Password is required.',
  )
  .max(
    AUTH_LOGIN_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_LOGIN_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  );

export const authLoginRememberSchema = z.boolean().default(false);

export const authLoginDeviceNameSchema = z
  .string()
  .trim()
  .min(1, 'Device name cannot be empty.')
  .max(
    AUTH_LOGIN_LIMITS.DEVICE_NAME_MAX_LENGTH,
    `Device name must be at most ${AUTH_LOGIN_LIMITS.DEVICE_NAME_MAX_LENGTH} characters.`,
  )
  .optional();

export const authLoginUserAgentSchema = z
  .string()
  .trim()
  .min(1, 'User agent cannot be empty.')
  .max(
    AUTH_LOGIN_LIMITS.USER_AGENT_MAX_LENGTH,
    `User agent must be at most ${AUTH_LOGIN_LIMITS.USER_AGENT_MAX_LENGTH} characters.`,
  )
  .optional();

export const authLoginIpAddressSchema = z
  .string()
  .trim()
  .min(1, 'IP address cannot be empty.')
  .max(
    AUTH_LOGIN_LIMITS.IP_ADDRESS_MAX_LENGTH,
    `IP address must be at most ${AUTH_LOGIN_LIMITS.IP_ADDRESS_MAX_LENGTH} characters.`,
  )
  .optional();

export const authLoginSchema = z.object({
  identifier: authLoginIdentifierSchema,
  password: authLoginPasswordSchema,
  remember: authLoginRememberSchema,
  deviceName: authLoginDeviceNameSchema,
  userAgent: authLoginUserAgentSchema,
  ipAddress: authLoginIpAddressSchema,
});

export const authLoginRequestSchema = z.object({
  body: authLoginSchema,
});

export const authLoginResponseUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    status: z.string(),
    displayName: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const authLoginResponseSessionSchema = z
  .object({
    id: z.string(),
    expiresAt: z.string(),
  })
  .passthrough();

export const authLoginTokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('Bearer').default('Bearer'),
    accessTokenExpiresAt: z.string().optional(),
    refreshTokenExpiresAt: z.string().optional(),
  })
  .passthrough();

export const authLoginAccessClaimsSchema = z
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

export const authLoginRefreshClaimsSchema = z
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

export const authLoginResponseSchema = z.object({
  user: authLoginResponseUserSchema,
  session: authLoginResponseSessionSchema,
  tokens: authLoginTokenPairSchema,
  accessClaims: authLoginAccessClaimsSchema,
  refreshClaims: authLoginRefreshClaimsSchema,
});

export const authLoginLegacyResponseSchema = z.object({
  user: authLoginResponseUserSchema,
  session: authLoginResponseSessionSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  tokenType: z.literal('Bearer'),
});

export type AuthLoginInput = z.input<typeof authLoginSchema>;
export type AuthLoginDto = z.infer<typeof authLoginSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

export type AuthLoginResponseUser = z.infer<typeof authLoginResponseUserSchema>;
export type AuthLoginResponseSession = z.infer<
  typeof authLoginResponseSessionSchema
>;
export type AuthLoginTokenPair = z.infer<typeof authLoginTokenPairSchema>;
export type AuthLoginAccessClaims = z.infer<typeof authLoginAccessClaimsSchema>;
export type AuthLoginRefreshClaims = z.infer<
  typeof authLoginRefreshClaimsSchema
>;

export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;
export type AuthLoginLegacyResponse = z.infer<
  typeof authLoginLegacyResponseSchema
>;

export const parseAuthLoginInput = (input: unknown): AuthLoginDto => {
  return authLoginSchema.parse(input);
};

export const safeParseAuthLoginInput = (input: unknown) => {
  return authLoginSchema.safeParse(input);
};

export const parseAuthLoginResponse = (input: unknown): AuthLoginResponse => {
  return authLoginResponseSchema.parse(input);
};

export const safeParseAuthLoginResponse = (input: unknown) => {
  return authLoginResponseSchema.safeParse(input);
};
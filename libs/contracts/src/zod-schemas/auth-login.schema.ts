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
  .min(1, 'Password is required.')
  .max(
    AUTH_LOGIN_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_LOGIN_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  );

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
  remember: z.boolean().default(false),
  deviceName: authLoginDeviceNameSchema,
  userAgent: authLoginUserAgentSchema,
  ipAddress: authLoginIpAddressSchema,
});

export const authLoginRequestSchema = z.object({
  body: authLoginSchema,
});

export const authLoginResponseUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authLoginResponseSessionSchema = z.object({
  id: z.string(),
  expiresAt: z.string(),
});

export const authLoginResponseSchema = z.object({
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
export type AuthLoginResponse = z.infer<typeof authLoginResponseSchema>;

export const parseAuthLoginInput = (input: unknown): AuthLoginDto => {
  return authLoginSchema.parse(input);
};

export const safeParseAuthLoginInput = (input: unknown) => {
  return authLoginSchema.safeParse(input);
};

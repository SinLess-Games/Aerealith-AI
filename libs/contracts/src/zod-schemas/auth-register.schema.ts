import { z } from 'zod';

export const AUTH_REGISTER_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  EMAIL_MAX_LENGTH: 320,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  DISPLAY_NAME_MAX_LENGTH: 120,
  TIMEZONE_MAX_LENGTH: 64,
  LOCALE_MAX_LENGTH: 16,
} as const;

export const AUTH_REGISTER_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
  LOCALE: /^[a-z]{2,3}(?:-[A-Z]{2})?$/,
} as const;

export const authRegisterUsernameSchema = z
  .string()
  .trim()
  .min(
    AUTH_REGISTER_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${AUTH_REGISTER_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_REGISTER_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${AUTH_REGISTER_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_REGISTER_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const authRegisterEmailSchema = z
  .string()
  .trim()
  .email('Email address must be valid.')
  .max(
    AUTH_REGISTER_LIMITS.EMAIL_MAX_LENGTH,
    `Email address must be at most ${AUTH_REGISTER_LIMITS.EMAIL_MAX_LENGTH} characters.`,
  )
  .transform((value) => value.toLowerCase());

export const authRegisterPasswordSchema = z
  .string()
  .min(
    AUTH_REGISTER_LIMITS.PASSWORD_MIN_LENGTH,
    `Password must be at least ${AUTH_REGISTER_LIMITS.PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_REGISTER_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_REGISTER_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  );

export const authRegisterDisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name cannot be empty.')
  .max(
    AUTH_REGISTER_LIMITS.DISPLAY_NAME_MAX_LENGTH,
    `Display name must be at most ${AUTH_REGISTER_LIMITS.DISPLAY_NAME_MAX_LENGTH} characters.`,
  )
  .optional();

export const authRegisterTimezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone cannot be empty.')
  .max(
    AUTH_REGISTER_LIMITS.TIMEZONE_MAX_LENGTH,
    `Timezone must be at most ${AUTH_REGISTER_LIMITS.TIMEZONE_MAX_LENGTH} characters.`,
  )
  .default('America/Boise');

export const authRegisterLocaleSchema = z
  .string()
  .trim()
  .regex(
    AUTH_REGISTER_REGEX.LOCALE,
    'Locale must use a valid format such as en, en-US, or es-MX.',
  )
  .max(
    AUTH_REGISTER_LIMITS.LOCALE_MAX_LENGTH,
    `Locale must be at most ${AUTH_REGISTER_LIMITS.LOCALE_MAX_LENGTH} characters.`,
  )
  .default('en-US');

export const authRegisterSchema = z.object({
  username: authRegisterUsernameSchema,
  email: authRegisterEmailSchema,
  password: authRegisterPasswordSchema,
  displayName: authRegisterDisplayNameSchema,
  timezone: authRegisterTimezoneSchema,
  locale: authRegisterLocaleSchema,
});

export const authRegisterRequestSchema = z.object({
  body: authRegisterSchema,
});

export const authRegisterResponseUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authRegisterResponseSchema = z.object({
  user: authRegisterResponseUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  tokenType: z.literal('Bearer'),
});

export type AuthRegisterInput = z.input<typeof authRegisterSchema>;
export type AuthRegisterDto = z.infer<typeof authRegisterSchema>;
export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;
export type AuthRegisterResponseUser = z.infer<
  typeof authRegisterResponseUserSchema
>;
export type AuthRegisterResponse = z.infer<typeof authRegisterResponseSchema>;

export const parseAuthRegisterInput = (input: unknown): AuthRegisterDto => {
  return authRegisterSchema.parse(input);
};

export const safeParseAuthRegisterInput = (input: unknown) => {
  return authRegisterSchema.safeParse(input);
};

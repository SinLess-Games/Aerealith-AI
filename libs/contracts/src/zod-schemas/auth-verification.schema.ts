import { z } from 'zod';

export const AUTH_VERIFICATION_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  EMAIL_MAX_LENGTH: 320,
  TOKEN_MIN_LENGTH: 16,
  TOKEN_MAX_LENGTH: 4096,
  PURPOSE_MAX_LENGTH: 64,
} as const;

export const AUTH_VERIFICATION_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
} as const;

export const AUTH_VERIFICATION_TOKEN_TYPE = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
  MAGIC_LINK: 'magic_link',
} as const;

export type AuthVerificationTokenType =
  (typeof AUTH_VERIFICATION_TOKEN_TYPE)[keyof typeof AUTH_VERIFICATION_TOKEN_TYPE];

export const authVerificationUsernameSchema = z
  .string()
  .trim()
  .min(
    AUTH_VERIFICATION_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${AUTH_VERIFICATION_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_VERIFICATION_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${AUTH_VERIFICATION_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_VERIFICATION_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const authVerificationEmailSchema = z
  .string()
  .trim()
  .email('Email address must be valid.')
  .max(
    AUTH_VERIFICATION_LIMITS.EMAIL_MAX_LENGTH,
    `Email address must be at most ${AUTH_VERIFICATION_LIMITS.EMAIL_MAX_LENGTH} characters.`,
  )
  .transform((value) => value.toLowerCase());

export const authVerificationTokenSchema = z
  .string()
  .trim()
  .min(
    AUTH_VERIFICATION_LIMITS.TOKEN_MIN_LENGTH,
    `Verification token must be at least ${AUTH_VERIFICATION_LIMITS.TOKEN_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_VERIFICATION_LIMITS.TOKEN_MAX_LENGTH,
    `Verification token must be at most ${AUTH_VERIFICATION_LIMITS.TOKEN_MAX_LENGTH} characters.`,
  );

export const authVerificationTokenTypeSchema = z.enum([
  AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
  AUTH_VERIFICATION_TOKEN_TYPE.PASSWORD_RESET,
  AUTH_VERIFICATION_TOKEN_TYPE.MAGIC_LINK,
]);

export const authVerificationParamsSchema = z.object({
  username: authVerificationUsernameSchema,
});

export const authCreateEmailVerificationTokenSchema = z.object({
  email: authVerificationEmailSchema.optional(),
});

export const authVerifyEmailSchema = z.object({
  token: authVerificationTokenSchema,
});

export const authCreateVerificationTokenSchema = z
  .object({
    username: authVerificationUsernameSchema.optional(),
    email: authVerificationEmailSchema.optional(),
    type: authVerificationTokenTypeSchema.default(
      AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
    ),
  })
  .refine(
    (value) => value.username !== undefined || value.email !== undefined,
    {
      message: 'Verification token creation requires either username or email.',
      path: ['email'],
    },
  );

export const authConsumeVerificationTokenSchema = z.object({
  token: authVerificationTokenSchema,
  type: authVerificationTokenTypeSchema.default(
    AUTH_VERIFICATION_TOKEN_TYPE.EMAIL_VERIFICATION,
  ),
});

export const authCreateEmailVerificationTokenRequestSchema = z.object({
  params: authVerificationParamsSchema,
  body: authCreateEmailVerificationTokenSchema.default({}),
});

export const authVerifyEmailRequestSchema = z.object({
  params: authVerificationParamsSchema,
  body: authVerifyEmailSchema,
});

export const authCreateVerificationTokenRequestSchema = z.object({
  body: authCreateVerificationTokenSchema,
});

export const authConsumeVerificationTokenRequestSchema = z.object({
  body: authConsumeVerificationTokenSchema,
});

export const authVerificationTokenResponseSchema = z.object({
  created: z.boolean(),
  type: authVerificationTokenTypeSchema,
  expiresAt: z.string(),
});

export const authEmailVerificationResponseSchema = z.object({
  verified: z.boolean(),
  username: z.string(),
  email: z.string(),
  verifiedAt: z.string(),
});

export const authVerificationTokenConsumeResponseSchema = z.object({
  consumed: z.boolean(),
  type: authVerificationTokenTypeSchema,
  consumedAt: z.string(),
});

export type AuthVerificationParams = z.infer<
  typeof authVerificationParamsSchema
>;

export type AuthCreateEmailVerificationTokenInput = z.input<
  typeof authCreateEmailVerificationTokenSchema
>;
export type AuthCreateEmailVerificationTokenDto = z.infer<
  typeof authCreateEmailVerificationTokenSchema
>;
export type AuthCreateEmailVerificationTokenRequest = z.infer<
  typeof authCreateEmailVerificationTokenRequestSchema
>;

export type AuthVerifyEmailInput = z.input<typeof authVerifyEmailSchema>;
export type AuthVerifyEmailDto = z.infer<typeof authVerifyEmailSchema>;
export type AuthVerifyEmailRequest = z.infer<
  typeof authVerifyEmailRequestSchema
>;

export type AuthCreateVerificationTokenInput = z.input<
  typeof authCreateVerificationTokenSchema
>;
export type AuthCreateVerificationTokenDto = z.infer<
  typeof authCreateVerificationTokenSchema
>;
export type AuthCreateVerificationTokenRequest = z.infer<
  typeof authCreateVerificationTokenRequestSchema
>;

export type AuthConsumeVerificationTokenInput = z.input<
  typeof authConsumeVerificationTokenSchema
>;
export type AuthConsumeVerificationTokenDto = z.infer<
  typeof authConsumeVerificationTokenSchema
>;
export type AuthConsumeVerificationTokenRequest = z.infer<
  typeof authConsumeVerificationTokenRequestSchema
>;

export type AuthVerificationTokenResponse = z.infer<
  typeof authVerificationTokenResponseSchema
>;
export type AuthEmailVerificationResponse = z.infer<
  typeof authEmailVerificationResponseSchema
>;
export type AuthVerificationTokenConsumeResponse = z.infer<
  typeof authVerificationTokenConsumeResponseSchema
>;

export const parseAuthVerificationParams = (
  input: unknown,
): AuthVerificationParams => {
  return authVerificationParamsSchema.parse(input);
};

export const safeParseAuthVerificationParams = (input: unknown) => {
  return authVerificationParamsSchema.safeParse(input);
};

export const parseAuthCreateEmailVerificationTokenInput = (
  input: unknown,
): AuthCreateEmailVerificationTokenDto => {
  return authCreateEmailVerificationTokenSchema.parse(input);
};

export const safeParseAuthCreateEmailVerificationTokenInput = (
  input: unknown,
) => {
  return authCreateEmailVerificationTokenSchema.safeParse(input);
};

export const parseAuthVerifyEmailInput = (
  input: unknown,
): AuthVerifyEmailDto => {
  return authVerifyEmailSchema.parse(input);
};

export const safeParseAuthVerifyEmailInput = (input: unknown) => {
  return authVerifyEmailSchema.safeParse(input);
};

export const parseAuthCreateVerificationTokenInput = (
  input: unknown,
): AuthCreateVerificationTokenDto => {
  return authCreateVerificationTokenSchema.parse(input);
};

export const safeParseAuthCreateVerificationTokenInput = (input: unknown) => {
  return authCreateVerificationTokenSchema.safeParse(input);
};

export const parseAuthConsumeVerificationTokenInput = (
  input: unknown,
): AuthConsumeVerificationTokenDto => {
  return authConsumeVerificationTokenSchema.parse(input);
};

export const safeParseAuthConsumeVerificationTokenInput = (input: unknown) => {
  return authConsumeVerificationTokenSchema.safeParse(input);
};

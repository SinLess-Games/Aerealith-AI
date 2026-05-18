import { z } from 'zod';

export const AUTH_PASSWORD_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_LENGTH: 128,
  TOKEN_MIN_LENGTH: 16,
  TOKEN_MAX_LENGTH: 4096,
  EMAIL_MAX_LENGTH: 320,
} as const;

export const AUTH_PASSWORD_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
  UPPERCASE: /[A-Z]/,
  LOWERCASE: /[a-z]/,
  NUMBER: /\d/,
  SPECIAL_CHARACTER: /[#@!$%^&*()=+\-_]/,
} as const;

export const AUTH_PASSWORD_SPECIAL_CHARACTERS = '#@!$%^&*()=+-_' as const;

export const authPasswordUsernameSchema = z
  .string()
  .trim()
  .min(
    AUTH_PASSWORD_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${AUTH_PASSWORD_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_PASSWORD_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${AUTH_PASSWORD_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_PASSWORD_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const authPasswordEmailSchema = z
  .string()
  .trim()
  .email('Email address must be valid.')
  .max(
    AUTH_PASSWORD_LIMITS.EMAIL_MAX_LENGTH,
    `Email address must be at most ${AUTH_PASSWORD_LIMITS.EMAIL_MAX_LENGTH} characters.`,
  )
  .transform((value) => value.toLowerCase());

export const authPasswordTokenSchema = z
  .string()
  .trim()
  .min(
    AUTH_PASSWORD_LIMITS.TOKEN_MIN_LENGTH,
    `Token must be at least ${AUTH_PASSWORD_LIMITS.TOKEN_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_PASSWORD_LIMITS.TOKEN_MAX_LENGTH,
    `Token must be at most ${AUTH_PASSWORD_LIMITS.TOKEN_MAX_LENGTH} characters.`,
  );

export const authStrongPasswordSchema = z
  .string()
  .min(
    AUTH_PASSWORD_LIMITS.PASSWORD_MIN_LENGTH,
    `Password must be at least ${AUTH_PASSWORD_LIMITS.PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    AUTH_PASSWORD_LIMITS.PASSWORD_MAX_LENGTH,
    `Password must be at most ${AUTH_PASSWORD_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
  )
  .regex(
    AUTH_PASSWORD_REGEX.UPPERCASE,
    'Password must include at least one capital letter.',
  )
  .regex(
    AUTH_PASSWORD_REGEX.LOWERCASE,
    'Password must include at least one lowercase letter.',
  )
  .regex(
    AUTH_PASSWORD_REGEX.NUMBER,
    'Password must include at least one number.',
  )
  .regex(
    AUTH_PASSWORD_REGEX.SPECIAL_CHARACTER,
    `Password must include at least one special character: ${AUTH_PASSWORD_SPECIAL_CHARACTERS}`,
  );

export const authPasswordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required.')
      .max(
        AUTH_PASSWORD_LIMITS.PASSWORD_MAX_LENGTH,
        `Current password must be at most ${AUTH_PASSWORD_LIMITS.PASSWORD_MAX_LENGTH} characters.`,
      ),
    newPassword: authStrongPasswordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New password and confirmation password must match.',
    path: ['confirmPassword'],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from current password.',
    path: ['newPassword'],
  });

export const authPasswordResetTokenSchema = z
  .object({
    username: authPasswordUsernameSchema.optional(),
    email: authPasswordEmailSchema.optional(),
  })
  .refine(
    (value) => value.username !== undefined || value.email !== undefined,
    {
      message: 'Password reset requires either username or email.',
      path: ['email'],
    },
  );

export const authPasswordResetSchema = z
  .object({
    token: authPasswordTokenSchema,
    newPassword: authStrongPasswordSchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New password and confirmation password must match.',
    path: ['confirmPassword'],
  });

export const authPasswordParamsSchema = z.object({
  username: authPasswordUsernameSchema,
});

export const authPasswordChangeRequestSchema = z.object({
  params: authPasswordParamsSchema,
  body: authPasswordChangeSchema,
});

export const authPasswordResetTokenRequestSchema = z.object({
  body: authPasswordResetTokenSchema,
});

export const authPasswordResetRequestSchema = z.object({
  body: authPasswordResetSchema,
});

export const authPasswordChangeResponseSchema = z
  .object({
    changed: z.boolean(),
    changedAt: z.string(),
  })
  .passthrough();

export const authPasswordResetTokenPublicResponseSchema = z
  .object({
    created: z.boolean(),
    expiresAt: z.string().optional(),
  })
  .passthrough();

export const authPasswordResetTokenResponseSchema = z
  .object({
    created: z.boolean().optional(),
    expiresAt: z.string().optional(),

    /**
     * Service-level token result fields.
     * Public routes should normally return `response`, not raw token data.
     */
    id: z.string().optional(),
    token: authPasswordTokenSchema.optional(),
    type: z.string().optional(),
    identifier: z.string().optional(),
    response: authPasswordResetTokenPublicResponseSchema.optional(),
  })
  .passthrough();

export const authPasswordResetResponseSchema = z
  .object({
    reset: z.boolean(),
    resetAt: z.string(),
  })
  .passthrough();

export type AuthPasswordParams = z.infer<typeof authPasswordParamsSchema>;

export type AuthPasswordChangeInput = z.input<typeof authPasswordChangeSchema>;
export type AuthPasswordChangeDto = z.infer<typeof authPasswordChangeSchema>;
export type AuthPasswordChangeRequest = z.infer<
  typeof authPasswordChangeRequestSchema
>;
export type AuthPasswordChangeResponse = z.infer<
  typeof authPasswordChangeResponseSchema
>;

export type AuthPasswordResetTokenInput = z.input<
  typeof authPasswordResetTokenSchema
>;
export type AuthPasswordResetTokenDto = z.infer<
  typeof authPasswordResetTokenSchema
>;
export type AuthPasswordResetTokenRequest = z.infer<
  typeof authPasswordResetTokenRequestSchema
>;
export type AuthPasswordResetTokenPublicResponse = z.infer<
  typeof authPasswordResetTokenPublicResponseSchema
>;
export type AuthPasswordResetTokenResponse = z.infer<
  typeof authPasswordResetTokenResponseSchema
>;

export type AuthPasswordResetInput = z.input<typeof authPasswordResetSchema>;
export type AuthPasswordResetDto = z.infer<typeof authPasswordResetSchema>;
export type AuthPasswordResetRequest = z.infer<
  typeof authPasswordResetRequestSchema
>;
export type AuthPasswordResetResponse = z.infer<
  typeof authPasswordResetResponseSchema
>;

export const parseAuthPasswordParams = (input: unknown): AuthPasswordParams => {
  return authPasswordParamsSchema.parse(input);
};

export const safeParseAuthPasswordParams = (input: unknown) => {
  return authPasswordParamsSchema.safeParse(input);
};

export const parseAuthPasswordChangeInput = (
  input: unknown,
): AuthPasswordChangeDto => {
  return authPasswordChangeSchema.parse(input);
};

export const safeParseAuthPasswordChangeInput = (input: unknown) => {
  return authPasswordChangeSchema.safeParse(input);
};

export const parseAuthPasswordChangeResponse = (
  input: unknown,
): AuthPasswordChangeResponse => {
  return authPasswordChangeResponseSchema.parse(input);
};

export const safeParseAuthPasswordChangeResponse = (input: unknown) => {
  return authPasswordChangeResponseSchema.safeParse(input);
};

export const parseAuthPasswordResetTokenInput = (
  input: unknown,
): AuthPasswordResetTokenDto => {
  return authPasswordResetTokenSchema.parse(input);
};

export const safeParseAuthPasswordResetTokenInput = (input: unknown) => {
  return authPasswordResetTokenSchema.safeParse(input);
};

export const parseAuthPasswordResetTokenResponse = (
  input: unknown,
): AuthPasswordResetTokenResponse => {
  return authPasswordResetTokenResponseSchema.parse(input);
};

export const safeParseAuthPasswordResetTokenResponse = (input: unknown) => {
  return authPasswordResetTokenResponseSchema.safeParse(input);
};

export const parseAuthPasswordResetTokenPublicResponse = (
  input: unknown,
): AuthPasswordResetTokenPublicResponse => {
  return authPasswordResetTokenPublicResponseSchema.parse(input);
};

export const safeParseAuthPasswordResetTokenPublicResponse = (
  input: unknown,
) => {
  return authPasswordResetTokenPublicResponseSchema.safeParse(input);
};

export const parseAuthPasswordResetInput = (
  input: unknown,
): AuthPasswordResetDto => {
  return authPasswordResetSchema.parse(input);
};

export const safeParseAuthPasswordResetInput = (input: unknown) => {
  return authPasswordResetSchema.safeParse(input);
};

export const parseAuthPasswordResetResponse = (
  input: unknown,
): AuthPasswordResetResponse => {
  return authPasswordResetResponseSchema.parse(input);
};

export const safeParseAuthPasswordResetResponse = (input: unknown) => {
  return authPasswordResetResponseSchema.safeParse(input);
};
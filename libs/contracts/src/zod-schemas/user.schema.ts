import { z } from 'zod';

import {
  environmentSchema,
  isoDateTimeSchema,
  requestIdSchema,
  uuidSchema,
} from './common.schema';

export const USER_LIMITS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 32,
  DISPLAY_NAME_MAX_LENGTH: 120,
  EMAIL_MAX_LENGTH: 320,
  AVATAR_URL_MAX_LENGTH: 2048,
  BIO_MAX_LENGTH: 512,
  LOCALE_MIN_LENGTH: 2,
  LOCALE_MAX_LENGTH: 16,
  TIMEZONE_MAX_LENGTH: 128,
} as const;

export const USER_REGEX = {
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/,
  LOCALE: /^[a-z]{2,3}(?:-[A-Z]{2})?$/,
} as const;

export const userStatusSchema = z.enum([
  'active',
  'pending_verification',
  'disabled',
  'suspended',
  'deleted',
  'locked',
]);

export const onboardingStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'skipped',
]);

export const userThemeSchema = z.enum(['system', 'light', 'dark']);

export const userPersonalitySchema = z.enum([
  'professional',
  'friendly',
  'mentor',
  'coach',
  'technical',
  'custom',
]);

export const usernameSchema = z
  .string()
  .trim()
  .min(
    USER_LIMITS.USERNAME_MIN_LENGTH,
    `Username must be at least ${USER_LIMITS.USERNAME_MIN_LENGTH} characters.`,
  )
  .max(
    USER_LIMITS.USERNAME_MAX_LENGTH,
    `Username must be at most ${USER_LIMITS.USERNAME_MAX_LENGTH} characters.`,
  )
  .regex(
    USER_REGEX.USERNAME,
    'Username may only contain letters, numbers, dots, underscores, and hyphens. It must start and end with a letter or number.',
  )
  .transform((value) => value.toLowerCase());

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name cannot be empty.')
  .max(
    USER_LIMITS.DISPLAY_NAME_MAX_LENGTH,
    `Display name must be at most ${USER_LIMITS.DISPLAY_NAME_MAX_LENGTH} characters.`,
  );

export const emailSchema = z
  .string()
  .trim()
  .email('Email address must be valid.')
  .max(
    USER_LIMITS.EMAIL_MAX_LENGTH,
    `Email address must be at most ${USER_LIMITS.EMAIL_MAX_LENGTH} characters.`,
  )
  .transform((value) => value.toLowerCase());

export const avatarUrlSchema = z
  .string()
  .trim()
  .url('Avatar URL must be valid.')
  .max(
    USER_LIMITS.AVATAR_URL_MAX_LENGTH,
    `Avatar URL must be at most ${USER_LIMITS.AVATAR_URL_MAX_LENGTH} characters.`,
  );

export const bioSchema = z
  .string()
  .trim()
  .max(
    USER_LIMITS.BIO_MAX_LENGTH,
    `Bio must be at most ${USER_LIMITS.BIO_MAX_LENGTH} characters.`,
  );

export const localeSchema = z
  .string()
  .trim()
  .min(
    USER_LIMITS.LOCALE_MIN_LENGTH,
    `Locale must be at least ${USER_LIMITS.LOCALE_MIN_LENGTH} characters.`,
  )
  .max(
    USER_LIMITS.LOCALE_MAX_LENGTH,
    `Locale must be at most ${USER_LIMITS.LOCALE_MAX_LENGTH} characters.`,
  )
  .regex(
    USER_REGEX.LOCALE,
    'Locale must use a valid format such as en, en-US, or es-MX.',
  );

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone cannot be empty.')
  .max(
    USER_LIMITS.TIMEZONE_MAX_LENGTH,
    `Timezone must be at most ${USER_LIMITS.TIMEZONE_MAX_LENGTH} characters.`,
  );

export const userIdSchema = uuidSchema;
export const userProfileIdSchema = uuidSchema;
export const userPreferenceIdSchema = uuidSchema;
export const userConsentIdSchema = uuidSchema;

export const userProfileSchema = z
  .object({
    id: userProfileIdSchema,
    userId: userIdSchema,
    username: usernameSchema.nullable(),
    displayName: displayNameSchema.nullable(),
    email: emailSchema.optional(),
    emailVerified: z.boolean().optional(),
    avatarUrl: avatarUrlSchema.nullable(),
    bio: bioSchema.nullable(),
    status: userStatusSchema,
    onboardingStatus: onboardingStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    deletedAt: isoDateTimeSchema.nullable(),
  })
  .passthrough();

export const publicUserProfileSchema = userProfileSchema
  .pick({
    userId: true,
    username: true,
    displayName: true,
    email: true,
    emailVerified: true,
    avatarUrl: true,
    bio: true,
    status: true,
    createdAt: true,
  })
  .passthrough();

export const authUserProfileSchema = z
  .object({
    id: userIdSchema.or(z.string().min(1)),
    username: usernameSchema.or(z.string().min(1)),
    email: emailSchema.or(z.string().min(1)),
    emailVerified: z.boolean(),
    status: userStatusSchema.or(z.string().min(1)),
    displayName: displayNameSchema.optional(),
    avatarUrl: avatarUrlSchema.optional(),
    createdAt: isoDateTimeSchema.or(z.string().min(1)),
    updatedAt: isoDateTimeSchema.or(z.string().min(1)),
  })
  .passthrough();

export const createUserProfileRequestSchema = z.object({
  userId: userIdSchema,
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  bio: bioSchema.nullable().optional(),
  requestId: requestIdSchema.optional(),
});

export const updateUserProfileRequestSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  bio: bioSchema.nullable().optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
  requestId: requestIdSchema.optional(),
});

export const userPreferencesSchema = z
  .object({
    id: userPreferenceIdSchema,
    userId: userIdSchema,
    locale: localeSchema,
    timezone: timezoneSchema,
    theme: userThemeSchema,
    personality: userPersonalitySchema,
    quietModeEnabled: z.boolean(),
    marketingEmailsEnabled: z.boolean(),
    productEmailsEnabled: z.boolean(),
    securityEmailsEnabled: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .passthrough();

export const updateUserPreferencesRequestSchema = z.object({
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
  theme: userThemeSchema.optional(),
  personality: userPersonalitySchema.optional(),
  quietModeEnabled: z.boolean().optional(),
  marketingEmailsEnabled: z.boolean().optional(),
  productEmailsEnabled: z.boolean().optional(),
  securityEmailsEnabled: z.boolean().optional(),
  requestId: requestIdSchema.optional(),
});

export const userConsentSchema = z
  .object({
    id: userConsentIdSchema,
    userId: userIdSchema,
    termsAcceptedAt: isoDateTimeSchema.nullable(),
    privacyAcceptedAt: isoDateTimeSchema.nullable(),
    analyticsConsentGranted: z.boolean(),
    personalizationConsentGranted: z.boolean(),
    marketingConsentGranted: z.boolean(),
    environment: environmentSchema.optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .passthrough();

export const updateUserConsentRequestSchema = z.object({
  analyticsConsentGranted: z.boolean().optional(),
  personalizationConsentGranted: z.boolean().optional(),
  marketingConsentGranted: z.boolean().optional(),
  requestId: requestIdSchema.optional(),
});

export const userProfileResponseSchema = z
  .object({
    profile: userProfileSchema,
  })
  .passthrough();

export const publicUserProfileResponseSchema = z
  .object({
    profile: publicUserProfileSchema,
  })
  .passthrough();

export const authUserProfileResponseSchema = z
  .object({
    user: authUserProfileSchema,
  })
  .passthrough();

export const userPreferencesResponseSchema = z
  .object({
    preferences: userPreferencesSchema,
  })
  .passthrough();

export const userConsentResponseSchema = z
  .object({
    consent: userConsentSchema,
  })
  .passthrough();

export type UserLimits = typeof USER_LIMITS;
export type UserRegex = typeof USER_REGEX;

export type UserStatus = z.infer<typeof userStatusSchema>;
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;
export type UserTheme = z.infer<typeof userThemeSchema>;
export type UserPersonality = z.infer<typeof userPersonalitySchema>;

export type Username = z.infer<typeof usernameSchema>;
export type DisplayName = z.infer<typeof displayNameSchema>;
export type UserEmail = z.infer<typeof emailSchema>;
export type AvatarUrl = z.infer<typeof avatarUrlSchema>;
export type UserBio = z.infer<typeof bioSchema>;
export type UserLocale = z.infer<typeof localeSchema>;
export type UserTimezone = z.infer<typeof timezoneSchema>;

export type UserId = z.infer<typeof userIdSchema>;
export type UserProfileId = z.infer<typeof userProfileIdSchema>;
export type UserPreferenceId = z.infer<typeof userPreferenceIdSchema>;
export type UserConsentId = z.infer<typeof userConsentIdSchema>;

export type UserProfileInput = z.infer<typeof userProfileSchema>;
export type PublicUserProfileInput = z.infer<typeof publicUserProfileSchema>;
export type AuthUserProfileInput = z.infer<typeof authUserProfileSchema>;

export type CreateUserProfileRequestInput = z.infer<
  typeof createUserProfileRequestSchema
>;
export type UpdateUserProfileRequestInput = z.infer<
  typeof updateUserProfileRequestSchema
>;

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type UpdateUserPreferencesRequestInput = z.infer<
  typeof updateUserPreferencesRequestSchema
>;

export type UserConsentInput = z.infer<typeof userConsentSchema>;
export type UpdateUserConsentRequestInput = z.infer<
  typeof updateUserConsentRequestSchema
>;

export type UserProfileResponseInput = z.infer<
  typeof userProfileResponseSchema
>;
export type PublicUserProfileResponseInput = z.infer<
  typeof publicUserProfileResponseSchema
>;
export type AuthUserProfileResponseInput = z.infer<
  typeof authUserProfileResponseSchema
>;
export type UserPreferencesResponseInput = z.infer<
  typeof userPreferencesResponseSchema
>;
export type UserConsentResponseInput = z.infer<
  typeof userConsentResponseSchema
>;

export const parseUserProfile = (input: unknown): UserProfileInput => {
  return userProfileSchema.parse(input);
};

export const safeParseUserProfile = (input: unknown) => {
  return userProfileSchema.safeParse(input);
};

export const parsePublicUserProfile = (
  input: unknown,
): PublicUserProfileInput => {
  return publicUserProfileSchema.parse(input);
};

export const safeParsePublicUserProfile = (input: unknown) => {
  return publicUserProfileSchema.safeParse(input);
};

export const parseAuthUserProfile = (input: unknown): AuthUserProfileInput => {
  return authUserProfileSchema.parse(input);
};

export const safeParseAuthUserProfile = (input: unknown) => {
  return authUserProfileSchema.safeParse(input);
};

export const parseCreateUserProfileRequest = (
  input: unknown,
): CreateUserProfileRequestInput => {
  return createUserProfileRequestSchema.parse(input);
};

export const safeParseCreateUserProfileRequest = (input: unknown) => {
  return createUserProfileRequestSchema.safeParse(input);
};

export const parseUpdateUserProfileRequest = (
  input: unknown,
): UpdateUserProfileRequestInput => {
  return updateUserProfileRequestSchema.parse(input);
};

export const safeParseUpdateUserProfileRequest = (input: unknown) => {
  return updateUserProfileRequestSchema.safeParse(input);
};

export const parseUserPreferences = (input: unknown): UserPreferencesInput => {
  return userPreferencesSchema.parse(input);
};

export const safeParseUserPreferences = (input: unknown) => {
  return userPreferencesSchema.safeParse(input);
};

export const parseUpdateUserPreferencesRequest = (
  input: unknown,
): UpdateUserPreferencesRequestInput => {
  return updateUserPreferencesRequestSchema.parse(input);
};

export const safeParseUpdateUserPreferencesRequest = (input: unknown) => {
  return updateUserPreferencesRequestSchema.safeParse(input);
};

export const parseUserConsent = (input: unknown): UserConsentInput => {
  return userConsentSchema.parse(input);
};

export const safeParseUserConsent = (input: unknown) => {
  return userConsentSchema.safeParse(input);
};

export const parseUpdateUserConsentRequest = (
  input: unknown,
): UpdateUserConsentRequestInput => {
  return updateUserConsentRequestSchema.parse(input);
};

export const safeParseUpdateUserConsentRequest = (input: unknown) => {
  return updateUserConsentRequestSchema.safeParse(input);
};

export const parseUserProfileResponse = (
  input: unknown,
): UserProfileResponseInput => {
  return userProfileResponseSchema.parse(input);
};

export const safeParseUserProfileResponse = (input: unknown) => {
  return userProfileResponseSchema.safeParse(input);
};

export const parsePublicUserProfileResponse = (
  input: unknown,
): PublicUserProfileResponseInput => {
  return publicUserProfileResponseSchema.parse(input);
};

export const safeParsePublicUserProfileResponse = (input: unknown) => {
  return publicUserProfileResponseSchema.safeParse(input);
};

export const parseAuthUserProfileResponse = (
  input: unknown,
): AuthUserProfileResponseInput => {
  return authUserProfileResponseSchema.parse(input);
};

export const safeParseAuthUserProfileResponse = (input: unknown) => {
  return authUserProfileResponseSchema.safeParse(input);
};

export const parseUserPreferencesResponse = (
  input: unknown,
): UserPreferencesResponseInput => {
  return userPreferencesResponseSchema.parse(input);
};

export const safeParseUserPreferencesResponse = (input: unknown) => {
  return userPreferencesResponseSchema.safeParse(input);
};

export const parseUserConsentResponse = (
  input: unknown,
): UserConsentResponseInput => {
  return userConsentResponseSchema.parse(input);
};

export const safeParseUserConsentResponse = (input: unknown) => {
  return userConsentResponseSchema.safeParse(input);
};
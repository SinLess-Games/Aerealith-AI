import { z } from 'zod';

import {
  environmentSchema,
  isoDateTimeSchema,
  uuidSchema,
} from './common.schema';

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

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const displayNameSchema = z.string().trim().min(1).max(80);

export const emailSchema = z.string().trim().toLowerCase().email();

export const avatarUrlSchema = z.string().trim().url();

export const localeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

export const timezoneSchema = z.string().trim().min(1).max(128);

export const userIdSchema = uuidSchema;

export const userProfileIdSchema = uuidSchema;

export const userPreferenceIdSchema = uuidSchema;

export const userConsentIdSchema = uuidSchema;

export const userProfileSchema = z.object({
  id: userProfileIdSchema,
  userId: userIdSchema,
  username: usernameSchema.nullable(),
  displayName: displayNameSchema.nullable(),
  avatarUrl: avatarUrlSchema.nullable(),
  bio: z.string().trim().max(512).nullable(),
  status: userStatusSchema,
  onboardingStatus: onboardingStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
});

export const publicUserProfileSchema = userProfileSchema.pick({
  userId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  status: true,
  createdAt: true,
});

export const createUserProfileRequestSchema = z.object({
  userId: userIdSchema,
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  bio: z.string().trim().max(512).nullable().optional(),
});

export const updateUserProfileRequestSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  avatarUrl: avatarUrlSchema.nullable().optional(),
  bio: z.string().trim().max(512).nullable().optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
});

export const userPreferencesSchema = z.object({
  id: userPreferenceIdSchema,
  userId: userIdSchema,
  locale: localeSchema,
  timezone: timezoneSchema,
  theme: z.enum(['system', 'light', 'dark']),
  personality: z.enum([
    'professional',
    'friendly',
    'mentor',
    'coach',
    'technical',
    'custom',
  ]),
  quietModeEnabled: z.boolean(),
  marketingEmailsEnabled: z.boolean(),
  productEmailsEnabled: z.boolean(),
  securityEmailsEnabled: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const updateUserPreferencesRequestSchema = z.object({
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  personality: z
    .enum([
      'professional',
      'friendly',
      'mentor',
      'coach',
      'technical',
      'custom',
    ])
    .optional(),
  quietModeEnabled: z.boolean().optional(),
  marketingEmailsEnabled: z.boolean().optional(),
  productEmailsEnabled: z.boolean().optional(),
  securityEmailsEnabled: z.boolean().optional(),
});

export const userConsentSchema = z.object({
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
});

export const updateUserConsentRequestSchema = z.object({
  analyticsConsentGranted: z.boolean().optional(),
  personalizationConsentGranted: z.boolean().optional(),
  marketingConsentGranted: z.boolean().optional(),
});

export const userProfileResponseSchema = z.object({
  profile: userProfileSchema,
});

export const publicUserProfileResponseSchema = z.object({
  profile: publicUserProfileSchema,
});

export const userPreferencesResponseSchema = z.object({
  preferences: userPreferencesSchema,
});

export const userConsentResponseSchema = z.object({
  consent: userConsentSchema,
});

export type UserStatus = z.infer<typeof userStatusSchema>;
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;
export type Username = z.infer<typeof usernameSchema>;
export type DisplayName = z.infer<typeof displayNameSchema>;
export type UserEmail = z.infer<typeof emailSchema>;
export type AvatarUrl = z.infer<typeof avatarUrlSchema>;
export type UserId = z.infer<typeof userIdSchema>;
export type UserProfileId = z.infer<typeof userProfileIdSchema>;
export type UserPreferenceId = z.infer<typeof userPreferenceIdSchema>;
export type UserConsentId = z.infer<typeof userConsentIdSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
export type PublicUserProfileInput = z.infer<typeof publicUserProfileSchema>;
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
export type UserPreferencesResponseInput = z.infer<
  typeof userPreferencesResponseSchema
>;
export type UserConsentResponseInput = z.infer<
  typeof userConsentResponseSchema
>;

import { z } from 'zod';

import { usernameSchema } from './username.schema';

export const USER_DISPLAY_NAME_MIN_LENGTH = 1;
export const USER_DISPLAY_NAME_MAX_LENGTH = 80;

export const createUserSchema = z
  .object({
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email({
      message: 'A valid email address is required.',
    }),
    displayName: z
      .string()
      .trim()
      .min(USER_DISPLAY_NAME_MIN_LENGTH, {
        message: `Display name must be at least ${USER_DISPLAY_NAME_MIN_LENGTH} character.`,
      })
      .max(USER_DISPLAY_NAME_MAX_LENGTH, {
        message: `Display name must be at most ${USER_DISPLAY_NAME_MAX_LENGTH} characters.`,
      })
      .optional(),
  })
  .strict();

export type CreateUserSchema = z.infer<typeof createUserSchema>;
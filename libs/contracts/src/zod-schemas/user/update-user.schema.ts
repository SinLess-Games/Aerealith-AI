import { z } from 'zod';

import { USER_STATUSES } from '../../types/user';
import {
  USER_DISPLAY_NAME_MAX_LENGTH,
  USER_DISPLAY_NAME_MIN_LENGTH,
} from './create-user.schema';

export const updateUserSchema = z
  .object({
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
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one user field must be provided.',
  });

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
import { z } from 'zod';

import type { Username } from '../../types/user';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH, {
    message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
  })
  .max(USERNAME_MAX_LENGTH, {
    message: `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
  })
  .regex(USERNAME_PATTERN, {
    message:
      'Username may only contain letters, numbers, underscores, and hyphens.',
  })
  .transform((username) => username.toLowerCase() as Username);

export type UsernameSchema = z.infer<typeof usernameSchema>;
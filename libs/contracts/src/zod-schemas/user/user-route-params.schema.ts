import { z } from 'zod';

import { usernameSchema } from './username.schema';

export const userRouteParamsSchema = z
  .object({
    username: usernameSchema,
  })
  .strict();

export type UserRouteParamsSchema = z.infer<typeof userRouteParamsSchema>;
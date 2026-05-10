import type { Context } from 'hono';
import type { ZodIssue } from 'zod';

import {
  UserErrorCode,
  userServiceUsernameSchema,
  type UserServiceUsername,
} from '@helix-ai/contracts';

export const USERNAME_PARAM_NAME = 'username';

export interface ValidUsernameParam {
  ok: true;
  username: UserServiceUsername;
}

export interface InvalidUsernameParam {
  ok: false;
  code: typeof UserErrorCode.INVALID_USERNAME;
  message: string;
  issues: ZodIssue[];
}

export type UsernameParamResult = ValidUsernameParam | InvalidUsernameParam;

export const parseUsernameParam = (
  value: string | undefined | null,
): UsernameParamResult => {
  const parsed = userServiceUsernameSchema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      code: UserErrorCode.INVALID_USERNAME,
      message:
        parsed.error.issues[0]?.message ??
        'A valid username route parameter is required.',
      issues: parsed.error.issues,
    };
  }

  return {
    ok: true,
    username: parsed.data,
  };
};

export const getUsernameParam = (context: Context): UsernameParamResult =>
  parseUsernameParam(context.req.param(USERNAME_PARAM_NAME));

export const requireUsernameParam = (context: Context): UserServiceUsername => {
  const result = getUsernameParam(context);

  if (!result.ok) {
    throw new Error(result.code);
  }

  return result.username;
};
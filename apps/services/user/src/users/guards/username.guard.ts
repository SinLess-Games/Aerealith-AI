import type { Context, Next } from 'hono';

import { getUsernameParam } from '@aerealith-ai/api';

export const USERNAME_CONTEXT_KEY = 'username';

export type UsernameGuardVariables = {
  username: string;
};

export const usernameGuard = async (
  context: Context,
  next: Next,
): Promise<Response | void> => {
  const usernameParam = getUsernameParam(context);

  if (!usernameParam.ok) {
    return context.json(
      {
        ok: false,
        error: {
          code: usernameParam.code,
          message: usernameParam.message,
          issues: usernameParam.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            code: issue.code,
            message: issue.message,
          })),
        },
      },
      400,
    );
  }

  context.set(USERNAME_CONTEXT_KEY, usernameParam.username);

  await next();
};

export const getGuardedUsername = (context: Context): string => {
  const username = context.get(USERNAME_CONTEXT_KEY);

  if (typeof username !== 'string' || username.length === 0) {
    throw new Error('USERNAME_GUARD_MISSING_USERNAME');
  }

  return username;
};
// apps/services/user/src/users/controllers/logger.ts

import type { Context } from 'hono';

import { createLogger, type LogEntryOptions } from '@aerealith-ai/observability';

import type { UserServiceContextEnv } from '../types';

type UserControllerContext = Context<{ Bindings: UserServiceContextEnv }>;

export type ValidationIssueInput = {
  code: string;
  message: string;
  path: readonly PropertyKey[];
};

export type MappedValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export const createUserControllerLogger = (context: UserControllerContext) => {
  return createLogger({
    service: context.env?.SERVICE_NAME ?? 'aerealith-user-service',
    env: {
      NODE_ENV: context.env?.NODE_ENV,
      SERVICE_NAME: context.env?.SERVICE_NAME,
      LOKI_API_TOKEN: context.env?.LOKI_API_TOKEN,
    },
  });
};

export const logUserControllerStart = (
  context: UserControllerContext,
  message: string,
  options: LogEntryOptions = {},
): void => {
  createUserControllerLogger(context).info(message, options);
};

export const logUserControllerError = (
  context: UserControllerContext,
  message: string,
  error: unknown,
  options: LogEntryOptions = {},
): void => {
  createUserControllerLogger(context).error(message, {
    ...options,
    error,
  });
};

export const mapValidationIssues = (
  issues: readonly ValidationIssueInput[],
): MappedValidationIssue[] => {
  return issues.map((issue) => ({
    path: issue.path.map(formatValidationIssuePathSegment).join('.'),
    code: issue.code,
    message: issue.message,
  }));
};

function formatValidationIssuePathSegment(segment: PropertyKey): string {
  if (typeof segment === 'symbol') {
    return segment.description ?? segment.toString();
  }

  return String(segment);
}

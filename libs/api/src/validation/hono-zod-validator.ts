import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z, ZodIssue } from 'zod';

export interface HonoZodValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface HonoZodValidationErrorResponse {
  ok: false;
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    issues: HonoZodValidationIssue[];
  };
}

export const formatZodIssuePath = (issue: ZodIssue): string => {
  if (issue.path.length === 0) {
    return '$';
  }

  return issue.path.map(String).join('.');
};

export const formatZodIssues = (
  issues: ZodIssue[],
): HonoZodValidationIssue[] =>
  issues.map((issue) => ({
    path: formatZodIssuePath(issue),
    code: issue.code,
    message: issue.message,
  }));

export const createValidationErrorResponse = (
  issues: ZodIssue[],
): HonoZodValidationErrorResponse => ({
  ok: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: issues[0]?.message ?? 'Request validation failed.',
    issues: formatZodIssues(issues),
  },
});

export const honoZodValidator = <
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, context) => {
    if (result.success) {
      return;
    }

    return context.json(createValidationErrorResponse(result.error.issues), 400);
  });
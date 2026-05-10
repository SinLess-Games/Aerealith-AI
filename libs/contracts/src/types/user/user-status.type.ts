export const USER_STATUSES = [
  'pending',
  'active',
  'disabled',
  'deleted',
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
export const AUTH_USER_STATUS = {
  ACTIVE: 'active',
  PENDING_VERIFICATION: 'pending_verification',
  DISABLED: 'disabled',
  LOCKED: 'locked',
  DELETED: 'deleted',
  SUSPENDED: 'suspended',
} as const;

export const AUTH_ACCOUNT_PROVIDER = {
  CREDENTIALS: 'credentials',
  EMAIL: 'email',
  GOOGLE: 'google',
  GITHUB: 'github',
  DISCORD: 'discord',
  UNKNOWN: 'unknown',
} as const;

export type AuthUserStatus =
  (typeof AUTH_USER_STATUS)[keyof typeof AUTH_USER_STATUS];

export type AuthAccountProvider =
  (typeof AUTH_ACCOUNT_PROVIDER)[keyof typeof AUTH_ACCOUNT_PROVIDER];

export type AuthUserId = string;
export type AuthAccountId = string;
export type AuthSessionId = string;
export type AuthUsername = string;
export type AuthEmail = string;

export type AuthUserIdentity = {
  id: AuthUserId;
  username: AuthUsername;
  email: AuthEmail;
  emailVerified: boolean;
  status: AuthUserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthAccountIdentity = {
  id: AuthAccountId;
  userId: AuthUserId;
  provider: AuthAccountProvider;
  providerAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthenticatedUser = AuthUserIdentity & {
  sessionId?: AuthSessionId;
  account?: AuthAccountIdentity;
};

export type PublicAuthUser = {
  id: AuthUserId;
  username: AuthUsername;
  email: AuthEmail;
  emailVerified: boolean;
  status: AuthUserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserLookup = {
  id?: AuthUserId;
  username?: AuthUsername;
  email?: AuthEmail;
};

export type AuthUserAccessCheck = {
  authenticatedUsername: AuthUsername;
  requestedUsername: AuthUsername;
  isAdmin?: boolean;
};

export const isAuthUserStatus = (value: unknown): value is AuthUserStatus => {
  return (
    typeof value === 'string' &&
    Object.values(AUTH_USER_STATUS).includes(value as AuthUserStatus)
  );
};

export const isAuthAccountProvider = (
  value: unknown,
): value is AuthAccountProvider => {
  return (
    typeof value === 'string' &&
    Object.values(AUTH_ACCOUNT_PROVIDER).includes(value as AuthAccountProvider)
  );
};

export const canAccessUsername = ({
  authenticatedUsername,
  requestedUsername,
  isAdmin = false,
}: AuthUserAccessCheck): boolean => {
  return isAdmin || authenticatedUsername === requestedUsername;
};

export const toPublicAuthUser = (user: AuthUserIdentity): PublicAuthUser => {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
};

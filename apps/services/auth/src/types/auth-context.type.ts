import type { Context } from 'hono';

import type {
  AuthSessionId,
  AuthUserId,
  AuthUsername,
  AuthenticatedUser,
} from '../../../../../libs/contracts/src/types/auth-user.type';
import type {
  AuthTokenClaims,
  AuthTokenScope,
  AuthTokenString,
  AuthTokenType,
} from './auth-token.type';

export const AUTH_CONTEXT_KEY = 'auth' as const;
export const AUTH_USER_CONTEXT_KEY = 'authUser' as const;
export const AUTH_SESSION_CONTEXT_KEY = 'authSession' as const;
export const AUTH_TOKEN_CONTEXT_KEY = 'authToken' as const;
export const AUTH_CLAIMS_CONTEXT_KEY = 'authClaims' as const;

export type AuthContextSession = {
  id: AuthSessionId;
  userId: AuthUserId;
  username: AuthUsername;
  expiresAt?: Date;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type AuthContextToken = {
  raw: AuthTokenString;
  type: AuthTokenType;
  scopes: AuthTokenScope[];
  claims: AuthTokenClaims;
};

export type AnonymousAuthContext = {
  isAuthenticated: false;
  user?: undefined;
  session?: undefined;
  token?: undefined;
  claims?: undefined;
};

export type AuthenticatedAuthContext = {
  isAuthenticated: true;
  user: AuthenticatedUser;
  session: AuthContextSession;
  token: AuthContextToken;
  claims: AuthTokenClaims;
};

export type AuthRequestContext =
  | AnonymousAuthContext
  | AuthenticatedAuthContext;

export type AuthContextVariables = {
  [AUTH_CONTEXT_KEY]: AuthRequestContext;
  [AUTH_USER_CONTEXT_KEY]?: AuthenticatedUser;
  [AUTH_SESSION_CONTEXT_KEY]?: AuthContextSession;
  [AUTH_TOKEN_CONTEXT_KEY]?: AuthContextToken;
  [AUTH_CLAIMS_CONTEXT_KEY]?: AuthTokenClaims;
};

export type AuthHonoEnv = {
  Variables: AuthContextVariables;
};

export type AuthContextHonoContext = Context<AuthHonoEnv>;

export type CreateAuthenticatedAuthContextInput = {
  user: AuthenticatedUser;
  session: AuthContextSession;
  token: AuthContextToken;
  claims: AuthTokenClaims;
};

export const createAnonymousAuthContext = (): AnonymousAuthContext => {
  return {
    isAuthenticated: false,
  };
};

export const createAuthenticatedAuthContext = ({
  user,
  session,
  token,
  claims,
}: CreateAuthenticatedAuthContextInput): AuthenticatedAuthContext => {
  return {
    isAuthenticated: true,
    user,
    session,
    token,
    claims,
  };
};

export const isAuthenticatedAuthContext = (
  auth: AuthRequestContext | undefined,
): auth is AuthenticatedAuthContext => {
  return auth?.isAuthenticated === true;
};

export const isAnonymousAuthContext = (
  auth: AuthRequestContext | undefined,
): auth is AnonymousAuthContext => {
  return auth?.isAuthenticated !== true;
};

export const getAuthContext = (
  c: AuthContextHonoContext,
): AuthRequestContext => {
  return c.get(AUTH_CONTEXT_KEY) ?? createAnonymousAuthContext();
};

export const getAuthenticatedAuthContext = (
  c: AuthContextHonoContext,
): AuthenticatedAuthContext | undefined => {
  const auth = getAuthContext(c);

  if (!isAuthenticatedAuthContext(auth)) {
    return undefined;
  }

  return auth;
};

export const getAuthUser = (
  c: AuthContextHonoContext,
): AuthenticatedUser | undefined => {
  return c.get(AUTH_USER_CONTEXT_KEY) ?? getAuthenticatedAuthContext(c)?.user;
};

export const getAuthSession = (
  c: AuthContextHonoContext,
): AuthContextSession | undefined => {
  return (
    c.get(AUTH_SESSION_CONTEXT_KEY) ?? getAuthenticatedAuthContext(c)?.session
  );
};

export const getAuthToken = (
  c: AuthContextHonoContext,
): AuthContextToken | undefined => {
  return c.get(AUTH_TOKEN_CONTEXT_KEY) ?? getAuthenticatedAuthContext(c)?.token;
};

export const getAuthClaims = (
  c: AuthContextHonoContext,
): AuthTokenClaims | undefined => {
  return (
    c.get(AUTH_CLAIMS_CONTEXT_KEY) ?? getAuthenticatedAuthContext(c)?.claims
  );
};

export const setAnonymousAuthContext = (c: AuthContextHonoContext): void => {
  c.set(AUTH_CONTEXT_KEY, createAnonymousAuthContext());
};

export const setAuthenticatedAuthContext = (
  c: AuthContextHonoContext,
  auth: AuthenticatedAuthContext,
): void => {
  c.set(AUTH_CONTEXT_KEY, auth);
  c.set(AUTH_USER_CONTEXT_KEY, auth.user);
  c.set(AUTH_SESSION_CONTEXT_KEY, auth.session);
  c.set(AUTH_TOKEN_CONTEXT_KEY, auth.token);
  c.set(AUTH_CLAIMS_CONTEXT_KEY, auth.claims);
};

export const authContextHasScope = (
  auth: AuthRequestContext | undefined,
  scope: AuthTokenScope,
): boolean => {
  return isAuthenticatedAuthContext(auth) && auth.token.scopes.includes(scope);
};

export const authContextHasEveryScope = (
  auth: AuthRequestContext | undefined,
  scopes: AuthTokenScope[],
): boolean => {
  return (
    isAuthenticatedAuthContext(auth) &&
    scopes.every((scope) => auth.token.scopes.includes(scope))
  );
};

export const authContextHasSomeScope = (
  auth: AuthRequestContext | undefined,
  scopes: AuthTokenScope[],
): boolean => {
  return (
    isAuthenticatedAuthContext(auth) &&
    scopes.some((scope) => auth.token.scopes.includes(scope))
  );
};

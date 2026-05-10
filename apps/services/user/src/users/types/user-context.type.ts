import type { EntityManager } from '@mikro-orm/postgresql';

export interface UserServiceBindings {
  AUTH_SERVICE?: Fetcher;
}

export interface UserServiceEnv {
  NODE_ENV?: string;
  SERVICE_NAME?: string;
  SERVICE_DISPLAY_NAME?: string;
  API_VERSION?: string;
  API_BASE_PATH?: string;
  LOG_LEVEL?: string;

  AUTH_SERVICE_NAME?: string;
  AUTH_SERVICE_BASE_PATH?: string;

  FRONTEND_SERVICE_NAME?: string;
  FRONTEND_ORIGIN?: string;

  DATABASE_PROVIDER?: string;
  DATABASE_SSL_ENABLED?: string;
  DATABASE_SSL_MODE?: string;
  DATABASE_SSL_REJECT_UNAUTHORIZED?: string;
  DATABASE_POOL_MIN?: string;
  DATABASE_POOL_MAX?: string;
  DATABASE_APPLICATION_NAME?: string;

  MIKRO_ORM_DEBUG?: string;

  POSTGRES_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_DB_URL?: string;
}

export type UserServiceContextEnv = UserServiceEnv & UserServiceBindings;

export interface UserRequestContext {
  requestId: string;
  env: UserServiceContextEnv;
  entityManager?: EntityManager;
}

export interface AuthenticatedUserContext {
  id: string;
  username?: string;
  email?: string;
  roles: string[];
  permissions: string[];
}

export interface UserRouteContext extends UserRequestContext {
  authUser?: AuthenticatedUserContext;
}

export type UserContextVariables = {
  requestId: string;
  userContext?: UserRouteContext;
  authUser?: AuthenticatedUserContext;
};